/**
 * 卫星地图相关共享类型。
 *
 * 注意：`MapRegion` 在本文件内本地定义，结构与 `react-native-maps` 的 `Region` 一致，
 * 但不直接 import `react-native-maps`，以保证 Web 端（satellite-map.web.tsx）也能引用本类型
 * 而不会把 react-native-maps 拉入 Web 打包。
 */

import type { GeoTaggedPhoto, PhotoCluster } from './geotagged-photo';
import type { Route } from './route';

/** 与 react-native-maps 的 MapType 一致，并扩展自定义类型 'weather'（天气地图，业务侧自定义渲染）。
 * 本地定义以避免 Web 端引入原生包。 */
export type MapType =
  | 'standard'
  | 'satellite'
  | 'hybrid'
  | 'terrain'
  | 'mutedStandard'
  | 'none'
  | 'satelliteFlyover'
  | 'hybridFlyover'
  | 'weather';

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

/** 与 react-native-maps 的 Region 结构一致；本地定义以避免 Web 端引入原生包。 */
export type MapRegion = GeoPoint & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapMarker = GeoPoint & {
  title: string;
  subtitle?: string;
};

export type SearchResult = GeoPoint & {
  displayName: string;
};

/** 系统用户位置（蓝点）更新事件，由 react-native-maps 的 onUserLocationChange 适配而来。 */
export type UserLocationUpdate = {
  latitude: number;
  longitude: number;
};

/** 长按地图事件：coordinate 为地理坐标，position 为 MapView 内像素坐标（用于定位浮动信息卡片）。 */
export type MapLongPressEvent = {
  coordinate: GeoPoint;
  position: { x: number; y: number };
};

export type SatelliteMapHandle = {
  /** 带动画移动到指定区域（默认 600ms）。可覆盖动画时长（0 = 无动画）。 */
  animateToRegion: (region: MapRegion, durationMs?: number) => void;
};

export type SatelliteMapProps = {
  initialRegion: MapRegion;
  /** 地图类型，默认 hybrid（卫星图叠加道路标注）。由图层选择器控制。 */
  mapType?: MapType;
  markers?: MapMarker[];
  /** 带 GPS 坐标的照片：在坐标处直接以图片 Marker 形式展示，点击触发 onPhotoPress。 */
  photoMarkers?: GeoTaggedPhoto[];
  /** 导入的路径文件，按 visible 过滤后渲染为 Polyline。 */
  routes?: Route[];
  /** 点击照片 Marker 回调，业务侧据此弹出详情面板。 */
  onPhotoPress?: (photo: GeoTaggedPhoto) => void;
  /** 点击照片簇 Marker 回调（视口内照片密集时聚合为簇），业务侧据此放大展开簇。 */
  onClusterPress?: (cluster: PhotoCluster) => void;
  showsUserLocation?: boolean;
  onRegionChangeComplete?: (region: MapRegion) => void;
  /** 地图区域变化回调（拖拽/缩放过程中持续触发），用于即时清除依赖像素坐标的浮动卡片。 */
  onRegionChange?: (region: MapRegion) => void;
  /**
   * 系统用户位置（蓝点）更新回调。
   * 蓝点由系统持续定位（精度通常高于单次定位快照），首帧用它对齐地图中心，
   * 可消除"地图中心(快照) vs 蓝点(系统定位)"两源不一致导致的真机偏移。
   */
  onUserLocationChange?: (location: UserLocationUpdate) => void;
  /** 单击地图空白处回调，通常用于取消/移除 Marker 与 Callout。 */
  onPress?: () => void;
  /** 长按地图空白处回调，返回长按点经纬度与屏幕像素坐标；长按时 native 不会 deselect，无 Callout 竞态。 */
  onLongPress?: (e: MapLongPressEvent) => void;
};
