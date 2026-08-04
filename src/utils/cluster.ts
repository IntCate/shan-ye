/**
 * 照片标记聚类工具（JS 侧，纯函数）。
 *
 * 背景：照片 Marker 是"图片 + 尾巴"的自定义视图，原生渲染成本高于默认大头针。
 * 视口内照片密集时（如某景区聚集几十张），直接铺开会在小范围内堆叠大量 Marker，
 * 视觉拥挤且浪费渲染。本工具把距离相近的照片聚合为"簇"（数量徽标），
 * 点击簇后放大到簇内包围盒，照片逐步展开——这是地图照片浏览的标准交互。
 *
 * 算法：像素空间网格聚类。把照片坐标以"视口中心为原点、delta 为尺度"归一化后，
 * 按屏幕像素半径（CLUSTER_RADIUS_PX）划分网格，同格照片聚为一簇（坐标取平均），
 * 单张保留原样。网格法是 O(n) 近似（相邻格对角距可能略超半径），对当前数据规模
 * （数百张）毫秒级完成，无需引入原生聚合库；照片量 >500 时再评估 supercluster。
 *
 * 同时承担视口裁剪：视口外（含缓冲）的照片直接丢弃，地图只渲染可见区域附近，
 * 配合 MAX_PHOTOS 上限将渲染规模控制在几十个 Marker。
 */

import { Dimensions } from 'react-native';

import type { GeoTaggedPhoto, PhotoCluster } from '@/types/geotagged-photo';
import type { MapRegion } from '@/types/map';

/** 聚类项：单张照片（保持原样）或照片簇（数量徽标）。 */
export type PhotoClusterItem = GeoTaggedPhoto | PhotoCluster;

/** 聚类半径（像素）：两标记点在屏幕上距离小于该值则聚合为簇。 */
const PHOTO_CLUSTER_RADIUS_PX = 80;
/** 视口外缓冲（视口宽/高的倍数）：预渲染周边一圈，拖拽时标记不闪没。 */
const VIEWPORT_BUFFER = 0.5;

/**
 * 把照片列表按视口聚类为「单张照片 / 照片簇」混合项。
 *
 * @param photos 照片列表（useGeotaggedPhotos 的物化结果，通常 ≤ MAX_PHOTOS）
 * @param region 当前视口（onRegionChangeComplete 的最新值）
 * @param radiusPx 聚类半径（像素），默认 PHOTO_CLUSTER_RADIUS_PX
 */
export function clusterPhotos(
  photos: GeoTaggedPhoto[],
  region: MapRegion,
  radiusPx = PHOTO_CLUSTER_RADIUS_PX
): PhotoClusterItem[] {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  // 归一化坐标：region 中心为原点，经/纬 delta 分别对应屏幕宽/高（地图全屏近似）
  const normX = (lng: number) => (lng - region.longitude) / region.longitudeDelta;
  const normY = (lat: number) => (lat - region.latitude) / region.latitudeDelta;
  // 像素 → 归一化单元；网格边长 = radiusPx 像素
  const cellX = radiusPx / screenW;
  const cellY = radiusPx / screenH;
  // 视口裁剪边界（含缓冲）：视口内归一化范围为 [-0.5, 0.5]
  const half = 0.5 + VIEWPORT_BUFFER;

  const buckets = new Map<string, GeoTaggedPhoto[]>();
  for (const p of photos) {
    const x = normX(p.longitude);
    const y = normY(p.latitude);
    if (Math.abs(x) > half || Math.abs(y) > half) continue; // 视口外，丢弃
    const key = `${Math.floor(x / cellX)},${Math.floor(y / cellY)}`;
    const group = buckets.get(key);
    if (group) group.push(p);
    else buckets.set(key, [p]);
  }

  const items: PhotoClusterItem[] = [];
  for (const [key, group] of buckets) {
    if (group.length === 1) {
      items.push(group[0]);
      continue;
    }
    let lat = 0;
    let lng = 0;
    for (const p of group) {
      lat += p.latitude;
      lng += p.longitude;
    }
    const cluster: PhotoCluster = {
      id: `photo-cluster-${key}`,
      count: group.length,
      photos: group,
      latitude: lat / group.length,
      longitude: lng / group.length,
    };
    items.push(cluster);
  }
  return items;
}
