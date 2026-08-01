/**
 * 地图照片地理标记数据层 hook（Web 占位）。
 *
 * expo-media-library 不支持 Web 平台，此处返回空结果，避免 Web 端引入原生模块报错。
 * Metro 在 Web 平台优先解析 .web.ts，故首页 import 的 useGeotaggedPhotos 在 Web 端拿到本文件。
 * 签名与 native 版本一致：{ photos, loading, refresh }。
 */

import type { GeoTaggedPhoto } from '@/types/geotagged-photo';

export function useGeotaggedPhotos(): {
  photos: GeoTaggedPhoto[];
  loading: boolean;
  refresh: () => void;
} {
  return {
    photos: [],
    loading: false,
    refresh: () => {},
  };
}
