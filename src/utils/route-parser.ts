/**
 * KML / GPX 路径文件解析器。
 *
 * 用 fast-xml-parser 将 XML 解析为 JS 对象，再按格式语义提取坐标点，组装为 Route[]。
 *
 * 坐标系差异（关键陷阱）：
 * - KML <coordinates> 文本格式为 `lng,lat,ele`（经度在前，逗号分隔，多组用空白分隔）。
 * - GPX <trkpt>/<rtept> 用属性 `lat`/`lon`（纬度在前）。
 * 解析时各自按正确顺序取值，最终统一为 { latitude, longitude }。
 *
 * fast-xml-parser 行为适配：
 * - 同名标签：单个元素返回对象、多个返回数组。用 toArray() 统一转数组遍历。
 * - 属性：ignoreAttributes:false + attributeNamePrefix:'' 让 GPX 的 lat/lon 属性直接作为字段。
 * - 命名空间：removeNSPrefix:true 去除标签前缀（KML/GPX 常用默认命名空间，标签名本身无前缀）。
 *
 * 容错：单条 Placemark/trk 无有效坐标点时跳过（返回 null），不中断整体解析；
 * 整个文件解析异常时向上抛出带文件名的错误，由 hook 兜底提示用户。
 */

import { XMLParser } from 'fast-xml-parser';
import { strFromU8, unzipSync } from 'fflate';

import type { MapRegion } from '@/types/map';
import type { Route, RoutePoint, RouteSegment } from '@/types/route';

/** fast-xml-parser 解析后的节点：动态嵌套的对象/数组/标量。 */
type XmlNode = Record<string, any>;

/** 路径线条颜色调色板，导入时按已导入数量循环分配，区分多路线。 */
export const ROUTE_COLORS = [
  '#FF3B30', // 红
  '#007AFF', // 蓝
  '#34C759', // 绿
  '#FF9500', // 橙
  '#AF52DE', // 紫
  '#5856D6', // 靛蓝
];

/** XML 解析器单例：属性保留 + 无前缀 + 去命名空间。 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
});

/** 同名标签：fast-xml-parser 对单个返回对象、多个返回数组。统一转数组便于遍历。 */
function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

/** 取节点字段为字符串（fast-xml-parser 可能解析为 number，统一转 string 再 parseFloat）。 */
function asString(val: unknown): string | undefined {
  return typeof val === 'string' || typeof val === 'number' ? String(val) : undefined;
}

/**
 * 解析 KML <coordinates> 文本（`lng,lat,ele lng,lat,ele ...`，空白分隔）为点数组。
 * 注意：KML 坐标经度在前、纬度在后，与 GeoPoint 的 {latitude, longitude} 相反。
 */
function parseKmlCoordinates(text: string): RoutePoint[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => {
      const parts = token.split(',');
      const longitude = parseFloat(parts[0] ?? '');
      const latitude = parseFloat(parts[1] ?? '');
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
      const point: RoutePoint = { latitude, longitude };
      const elevation = parseFloat(parts[2] ?? '');
      if (!Number.isNaN(elevation)) point.elevation = elevation;
      return point;
    })
    .filter((p): p is RoutePoint => p !== null);
}

/** 从一个 LineString 节点提取坐标点，无有效点返回 null。 */
function extractKmlLineString(lineString: XmlNode): RoutePoint[] | null {
  const coords = asString(lineString?.coordinates);
  if (!coords) return null;
  const points = parseKmlCoordinates(coords);
  return points.length > 0 ? points : null;
}

/** 递归收集节点下所有 Placemark（KML 的 Document/Folder 可任意层嵌套）。 */
function collectPlacemarks(node: XmlNode | undefined, acc: XmlNode[] = []): XmlNode[] {
  if (!node || typeof node !== 'object') return acc;
  for (const pm of toArray<XmlNode>(node.Placemark)) {
    acc.push(pm);
  }
  // Folder 与 Document 都可能嵌套，深度遍历
  for (const folder of toArray<XmlNode>(node.Folder)) {
    collectPlacemarks(folder, acc);
  }
  for (const doc of toArray<XmlNode>(node.Document)) {
    collectPlacemarks(doc, acc);
  }
  return acc;
}

/** 解析 gx:Track 的 coord 文本（`lng lat ele`，空格分隔）为点。removeNSPrefix 已去 gx: 前缀。 */
function parseGxTrackCoord(text: string): RoutePoint | null {
  const parts = text.trim().split(/\s+/);
  const longitude = parseFloat(parts[0] ?? '');
  const latitude = parseFloat(parts[1] ?? '');
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  const point: RoutePoint = { latitude, longitude };
  const elevation = parseFloat(parts[2] ?? '');
  if (!Number.isNaN(elevation)) point.elevation = elevation;
  return point;
}

/** 解析单个 KML Placemark：收集其下所有 LineString / gx:Track（含 MultiGeometry 内）为段。 */
function parseKmlPlacemark(
  placemark: XmlNode,
  baseName: string,
  idx: number,
  colorIndex: number
): Route | null {
  const name = asString(placemark.name) ?? `${baseName} ${idx + 1}`;
  const segments: RouteSegment[] = [];

  // 直接 LineString
  for (const ls of toArray<XmlNode>(placemark.LineString)) {
    const points = extractKmlLineString(ls);
    if (points) segments.push({ points });
  }
  // MultiGeometry 内的 LineString 与 gx:Track（一条路线可含多段）
  for (const mg of toArray<XmlNode>(placemark.MultiGeometry)) {
    for (const ls of toArray<XmlNode>(mg?.LineString)) {
      const points = extractKmlLineString(ls);
      if (points) segments.push({ points });
    }
    for (const track of toArray<XmlNode>(mg?.Track)) {
      const points = toArray<XmlNode>(track.coord)
        .map((c) => parseGxTrackCoord(asString(c) ?? ''))
        .filter((p): p is RoutePoint => p !== null);
      if (points.length > 0) segments.push({ points });
    }
  }
  // 直接 gx:Track（Google Earth 轨迹，removeNSPrefix 去掉 gx: 前缀后为 Track）
  for (const track of toArray<XmlNode>(placemark.Track)) {
    const points = toArray<XmlNode>(track.coord)
      .map((c) => parseGxTrackCoord(asString(c) ?? ''))
      .filter((p): p is RoutePoint => p !== null);
    if (points.length > 0) segments.push({ points });
  }

  if (segments.length === 0) return null;
  return {
    id: `kml-${Date.now()}-${idx}`,
    name,
    format: 'kml',
    segments,
    originalSegments: segments,
    visible: true,
    color: ROUTE_COLORS[colorIndex % ROUTE_COLORS.length],
    coordMode: 'raw',
    importedAt: Date.now(),
  };
}

/** 解析 KML 文档：递归遍历所有嵌套的 Document/Folder 下的 Placemark。 */
function parseKml(content: string, baseName: string, existingCount: number): Route[] {
  const parsed = parser.parse(content) as XmlNode;
  const kml = (parsed.kml ?? parsed) as XmlNode;
  // 递归收集所有 Placemark（Document/Folder 可任意层嵌套）
  const placemarks = collectPlacemarks(kml);

  const routes: Route[] = [];
  placemarks.forEach((pm, i) => {
    const route = parseKmlPlacemark(pm, baseName, i, existingCount + routes.length);
    if (route) routes.push(route);
  });

  if (routes.length === 0) {
    // 调试：输出解析后顶层结构，帮助诊断 KML 格式差异
    console.warn(
      '[route-parser] KML 未找到有效路径。共找到 Placemark:', placemarks.length,
      '。解析后顶层结构（截断 800 字符）:',
      JSON.stringify(kml).slice(0, 800)
    );
  }
  return routes;
}

/** 解析单个 GPX 点节点（trkpt/rtept）：lat/lon 属性 + 可选 ele/time 子元素。 */
function parseGpxPoint(pt: XmlNode): RoutePoint | null {
  const latitude = parseFloat(asString(pt.lat) ?? '');
  const longitude = parseFloat(asString(pt.lon) ?? '');
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  const point: RoutePoint = { latitude, longitude };
  const elevation = parseFloat(asString(pt.ele) ?? '');
  if (!Number.isNaN(elevation)) point.elevation = elevation;
  const timeStr = asString(pt.time);
  if (timeStr) {
    const t = Date.parse(timeStr);
    if (!Number.isNaN(t)) point.time = t;
  }
  return point;
}

/** 解析 GPX 文档：遍历 trk（含 trkseg）与 rte。 */
function parseGpx(content: string, baseName: string, existingCount: number): Route[] {
  const parsed = parser.parse(content) as XmlNode;
  const gpx = (parsed.gpx ?? parsed) as XmlNode;
  const routes: Route[] = [];
  let idx = 0;

  // trk（track）：含一个或多个 trkseg，每段一条连续路径
  for (const trk of toArray<XmlNode>(gpx.trk)) {
    const name = asString(trk.name) ?? `${baseName} ${idx + 1}`;
    const segments: RouteSegment[] = [];
    for (const seg of toArray<XmlNode>(trk.trkseg)) {
      const points = toArray<XmlNode>(seg.trkpt)
        .map(parseGpxPoint)
        .filter((p): p is RoutePoint => p !== null);
      if (points.length > 0) segments.push({ points });
    }
    if (segments.length > 0) {
      routes.push({
        id: `gpx-${Date.now()}-${idx}`,
        name,
        format: 'gpx',
        segments,
        originalSegments: segments,
        visible: true,
        color: ROUTE_COLORS[(existingCount + routes.length) % ROUTE_COLORS.length],
        coordMode: 'raw',
        importedAt: Date.now(),
      });
      idx += 1;
    }
  }

  // rte（route）：一组有序 rtept，作为单段路径
  for (const rte of toArray<XmlNode>(gpx.rte)) {
    const name = asString(rte.name) ?? `${baseName} ${idx + 1}`;
    const points = toArray<XmlNode>(rte.rtept)
      .map(parseGpxPoint)
      .filter((p): p is RoutePoint => p !== null);
    if (points.length > 0) {
      routes.push({
        id: `gpx-${Date.now()}-${idx}`,
        name,
        format: 'gpx',
        segments: [{ points }],
        originalSegments: [{ points }],
        visible: true,
        color: ROUTE_COLORS[(existingCount + routes.length) % ROUTE_COLORS.length],
        coordMode: 'raw',
        importedAt: Date.now(),
      });
      idx += 1;
    }
  }

  if (routes.length === 0) {
    // 调试：输出解析后顶层结构，帮助诊断 GPX 格式差异
    console.warn(
      '[route-parser] GPX 未找到有效路径。解析后顶层结构（截断 800 字符）:',
      JSON.stringify(gpx).slice(0, 800)
    );
  }
  return routes;
}

/**
 * 解析 KMZ 文件（ZIP 压缩的 KML）。
 *
 * KMZ 是 Google Earth 的标准打包格式，本质是一个 ZIP 文件，内部通常含 `doc.kml`
 * 及可能的图标/图片资源。用 fflate（纯 JS ZIP 解压器）解压后提取 KML 文本，
 * 再复用 parseKml 解析。
 */
function parseKmz(data: Uint8Array, baseName: string, existingCount: number): Route[] {
  const files = unzipSync(data);
  // 优先取 doc.kml（Google Earth 默认名），否则取第一个 .kml 文件
  const kmlName =
    Object.keys(files).find((n) => n.toLowerCase() === 'doc.kml') ??
    Object.keys(files).find((n) => n.toLowerCase().endsWith('.kml'));

  if (!kmlName) {
    throw new Error('KMZ 文件中未找到 .kml 文件');
  }

  const kmlText = strFromU8(files[kmlName]);
  const routes = parseKml(kmlText, baseName, existingCount);
  // 覆盖 format 与 id 前缀，标识来源为 KMZ
  return routes.map((r) => ({
    ...r,
    format: 'kmz' as const,
    id: r.id.replace(/^kml-/, 'kmz-'),
  }));
}

/**
 * 解析路径文件入口：按扩展名分发到 KML/GPX/KMZ 解析器。
 *
 * @param filename 文件名（含扩展名），用于判断格式与回退名称
 * @param content 文件内容：KML/GPX 为 UTF-8 文本字符串，KMZ 为二进制 Uint8Array
 * @param existingCount 当前已导入的路线数，用于颜色循环分配
 * @returns 解析出的路线数组（可能为空）
 * @throws 不支持的格式或 XML 解析失败时抛出带文件名的错误
 */
export function parseRouteFile(
  filename: string,
  content: string | Uint8Array,
  existingCount = 0
): Route[] {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const baseName = filename.replace(/\.[^.]+$/, '') || '未命名路径';

  if (ext === 'kmz') return parseKmz(content as Uint8Array, baseName, existingCount);
  if (ext === 'kml') return parseKml(content as string, baseName, existingCount);
  if (ext === 'gpx') return parseGpx(content as string, baseName, existingCount);

  // 无扩展名时按内容嗅探根标签（仅文本格式支持嗅探，KMZ 是二进制无法嗅探）
  if (typeof content === 'string') {
    const head = content.trimStart().slice(0, 200).toLowerCase();
    if (head.includes('<kml')) return parseKml(content, baseName, existingCount);
    if (head.includes('<gpx')) return parseGpx(content, baseName, existingCount);
  }

  throw new Error(`不支持的文件格式：${ext || '未知'}（仅支持 .kml / .gpx / .kmz）`);
}

/**
 * 计算路线的包围盒区域，用于导入/点击路线时 moveMap 定位。
 * delta 加 20% padding 确保整条路线可见；最小 delta 防止单点路线缩放过近。
 */
export function getRouteRegion(route: Route): MapRegion {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const seg of route.segments) {
    for (const p of seg.points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
  }

  // 极端兜底：路线无有效点（不应发生，parser 已过滤），回退到 0,0
  if (!Number.isFinite(minLat)) {
    return { latitude: 0, longitude: 0, latitudeDelta: 0.01, longitudeDelta: 0.01 };
  }

  const latDelta = Math.max((maxLat - minLat) * 1.2, 0.005);
  const lngDelta = Math.max((maxLng - minLng) * 1.2, 0.005);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}
