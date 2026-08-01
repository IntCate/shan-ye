/**
 * 路径文件相关共享类型。
 *
 * 由 use-routes hook 导入 KML/GPX 文件后解析为 Route[]，供卫星地图以 Polyline 形式展示。
 * 与 GeoTaggedPhoto 同层：仅含地图渲染所需字段，不保留原始 XML 结构。
 */

import type { GeoPoint } from './map';

/** 路径上的单个点（经纬度 + 可选海拔/时间）。 */
export type RoutePoint = GeoPoint & {
  /** 海拔（米）；GPX <ele> / KML <coordinates> 第三维。 */
  elevation?: number;
  /** 时间戳（UNIX 毫秒）；GPX <time>，KML 一般无此字段。 */
  time?: number;
};

/** 一条连续路径段。KML <LineString> 或 GPX <trkseg>/<rte>。一条路线可含多段。 */
export type RouteSegment = {
  points: RoutePoint[];
};

/**
 * 坐标转换模式，用于修正国内轨迹文件与地图底图间的坐标系不匹配。
 * - raw：原始坐标，不转换（文件坐标系与地图底图一致时使用）
 * - toWgs84：GCJ-02 → WGS-84（文件是 GCJ-02 火星坐标，地图期望 WGS-84）
 * - toGcj02：WGS-84 → GCJ-02（文件是 WGS-84，但地图卫星图底图用 GCJ-02 且不做内部转换时，
 *   直接转 GCJ-02 对齐底图，避免"GCJ-02→WGS-84→地图再转GCJ-02"双重近似算法叠加误差）
 */
export type CoordMode = 'raw' | 'toWgs84' | 'toGcj02';

/** 一条路线（可含多段）。对应 KML <Placemark> 或 GPX <trk>/<rte>。 */
export type Route = {
  /** 唯一 ID，导入时生成（`${format}-${Date.now()}-${idx}`）。 */
  id: string;
  /** 显示名称：KML <name> / GPX <name> / 文件名（去扩展名）回退。 */
  name: string;
  /** 源文件格式。 */
  format: 'kml' | 'gpx';
  /** 当前用于地图渲染的路径段（可能经坐标转换）。 */
  segments: RouteSegment[];
  /** 导入时的原始路径段，永不变，用于切换坐标模式时重新转换避免精度损失。 */
  originalSegments: RouteSegment[];
  /** 是否在地图上显示，默认 true。 */
  visible: boolean;
  /** 线条颜色，导入时从 ROUTE_COLORS 调色板循环分配。 */
  color: string;
  /** 当前坐标转换模式，默认 raw。用户在路径面板循环切换。 */
  coordMode: CoordMode;
  /** 导入时间（UNIX 毫秒）。 */
  importedAt: number;
};
