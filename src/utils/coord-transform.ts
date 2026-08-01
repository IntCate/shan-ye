/**
 * GCJ-02（火星坐标系）↔ WGS-84 坐标转换。
 *
 * 中国国家测绘局要求国内地图使用 GCJ-02 坐标系（在 WGS-84 基础上加了非线性偏移）。
 * 国内 App（高德、腾讯、两步路、六只脚等）导出的轨迹文件坐标通常是 GCJ-02，
 * 而 Apple Maps / Google Maps（react-native-maps）底图用 WGS-84，直接传入会导致
 * 50~500 米偏移。
 *
 * 本模块提供互转：gcj02ToWgs84 用于纠偏（GCJ-02 文件 → WGS-84 地图显示），
 * wgs84ToGcj02 用于逆操作（纠偏后切回原始坐标对比）。
 *
 * 算法基于公开的 GCJ-02 偏移公式，逆变换为近似（减去正变换偏移量），精度约 1~2 米，
 * 对轨迹展示足够。中国境外坐标不做转换（无偏移）。
 */

import type { GeoPoint } from '@/types/map';

const PI = Math.PI;
/** Krasovsky 1940 椭球体长半轴（米）。 */
const A = 6378245.0;
/** 椭球体偏心率平方。 */
const EE = 0.00669342162296594323;

/** 判断坐标是否在中国境内（粗略边界）。境外无 GCJ-02 偏移，无需转换。 */
function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** WGS-84 → GCJ-02（正变换）。中国境外原样返回。 */
export function wgs84ToGcj02(point: GeoPoint): GeoPoint {
  const { latitude: lat, longitude: lng } = point;
  if (outOfChina(lng, lat)) return { latitude: lat, longitude: lng };

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);

  return { latitude: lat + dLat, longitude: lng + dLng };
}

/**
 * GCJ-02 → WGS-84（迭代法精确逆变换）。中国境外原样返回。
 *
 * 正变换 wgs84ToGcj02 是精确的，但 GCJ-02 偏移非线性，无解析逆。
 * 旧方案（直接减去偏移量）是近似逆，残余误差数米。
 * 改用不动点迭代逼近：W_{n+1} = W_n − (gcj02(W_n) − G)，
 * 通常 2~3 次迭代收敛到 1e-7 度（约 1cm），精度远优于简单减法。
 */
export function gcj02ToWgs84(point: GeoPoint): GeoPoint {
  const { latitude: gLat, longitude: gLng } = point;
  if (outOfChina(gLng, gLat)) return { latitude: gLat, longitude: gLng };

  // 初始猜测：用 GCJ-02 坐标作为 WGS-84 近似
  let wLat = gLat;
  let wLng = gLng;
  for (let i = 0; i < 10; i++) {
    const transformed = wgs84ToGcj02({ latitude: wLat, longitude: wLng });
    const dLat = transformed.latitude - gLat;
    const dLng = transformed.longitude - gLng;
    wLat -= dLat;
    wLng -= dLng;
    // 收敛判定：偏移 < 1e-7 度（约 1cm）即停止
    if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) break;
  }
  return { latitude: wLat, longitude: wLng };
}

/**
 * 对单个带坐标的对象做转换，保留原始对象的其他字段（elevation、time、uri 等）。
 *
 * 照片 Marker（GeoTaggedPhoto）和路径点（RoutePoint）都扩展自 GeoPoint，
 * 转换时只需替换 latitude/longitude，其余字段原样保留。
 * 统一走此函数，避免照片和路径两处各自手写 spread 导致风格不一致。
 *
 * 泛型 T 约束为 GeoPoint 超集，确保返回类型与输入一致。
 */
export function withConvertedCoords<T extends GeoPoint>(
  point: T,
  convert: (p: GeoPoint) => GeoPoint
): T {
  return { ...point, ...convert(point) };
}
