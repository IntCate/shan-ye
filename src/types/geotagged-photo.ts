/**
 * 带 GPS 坐标的照片视图模型，用于在地图上以 Marker + Callout 形式展示。
 *
 * 由 useGeotaggedPhotos hook 从设备相册提取 EXIF 坐标（Asset.getLocation()）后物化，
 * 仅包含地图渲染所需字段（坐标、拍摄时间），避免引入完整 PhotoItem。
 *
 * 图片展示不保存 uri：数据管线只读轻量元数据（getLocation/getCreationTime 不解码、不触发
 * iCloud 下载），渲染时直接用 id（iOS 为 ph:// localIdentifier URI）作为 expo-image 的
 * source——expo-image 原生按容器尺寸请求系统缩略图（见 PhotoLibraryAssetLoader），
 * 避免为无 GPS 照片白白 getUri（原图路径 + iCloud 下载）。
 */

import type { GeoPoint } from './map';

export type GeoTaggedPhoto = GeoPoint & {
  /** = asset.id（iOS 为 ph:// localIdentifier），作为 Marker key 与 expo-image source。 */
  id: string;
  /** 拍摄时间（UNIX 毫秒），用于 Callout 内显示日期。 */
  creationTime: number;
};

/**
 * 照片簇：视口内距离相近的多张照片聚合而成的标记点。
 * 由 utils/cluster.ts 的 clusterPhotos 网格聚类生成，坐标为簇内照片的平均值，
 * 点击后业务侧放大到簇内照片包围盒（moveMap），使其展开为单张照片 Marker。
 */
export type PhotoCluster = GeoPoint & {
  /** 簇唯一标识（由聚类网格桶索引生成，视口变化后重新生成）。 */
  id: string;
  /** 簇内照片数量。 */
  count: number;
  /** 簇内照片，供展开时计算包围盒。 */
  photos: GeoTaggedPhoto[];
};
