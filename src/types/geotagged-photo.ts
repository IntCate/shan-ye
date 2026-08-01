/**
 * 带 GPS 坐标的照片视图模型，用于在地图上以 Marker + Callout 形式展示。
 *
 * 由 useGeotaggedPhotos hook 从设备相册提取 EXIF 坐标（Asset.getLocation()）后物化，
 * 仅包含地图渲染所需字段（坐标、显示 URI、拍摄时间），避免引入完整 PhotoItem。
 */

import type { GeoPoint } from './map';

export type GeoTaggedPhoto = GeoPoint & {
  /** = asset.id，作为 Marker key。 */
  id: string;
  /** getUri() 结果：Callout 内 Image 的显示源。 */
  uri: string;
  /** 拍摄时间（UNIX 毫秒），用于 Callout 内显示日期。 */
  creationTime: number;
};
