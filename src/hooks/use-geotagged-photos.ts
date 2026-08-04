/**
 * 地图照片地理标记数据层 hook（native）。
 *
 * 从设备相册分页加载照片，提取每张照片的 EXIF GPS 坐标（Asset.getLocation()），
 * 过滤出有坐标的照片，供首页地图以 Marker + Callout 形式展示。
 *
 * 设计要点：
 * - 渐进式更新：每页处理完即 setPhotos，标记逐步出现在地图上（EXIF 读取较慢，避免等全部完成）。
 * - 容量上限 MAX_PHOTOS：防止标记过密、Callout 互斥渲染与内存压力。
 * - MAX_PAGES_SCANNED：防止无 GPS 照片过多时无限翻页空转。
 * - 只读轻量元数据：每张照片仅取 getLocation + getCreationTime（iOS 直接读 PHAsset 属性，
 *   不解码图片、不触发 iCloud 下载）；渲染时用 id（ph://）作 expo-image source 按需加载缩略图。
 * - 单条 asset 取值失败（如 Android 未授 ACCESS_MEDIA_LOCATION 抛异常）用 try/catch 兜底，
 *   console.warn 记录、不吞异常，不影响整页其他照片。
 *
 * 权限：undetermined → 主动请求；granted（含 limited access）→ 加载；denied → 不加载。
 * 参照 src/hooks/use-photo-album.ts 的分页 Query + materializeAssets 批量物化模式。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { addListener, AssetField, MediaType, Query } from 'expo-media-library';

import { MEDIA_PAGE_SIZE } from '@/constants/media';
import { useMediaLibraryPermission } from '@/hooks/use-media-library-permission';
import { materializeAssets } from '@/services/media-library';
import type { GeoTaggedPhoto } from '@/types/geotagged-photo';

/** 地图上最多展示的照片标记数上限。原始照片 Marker 较重（每张需加载并渲染位图），
 *  且视口内密集照片会被聚类（utils/cluster.ts）聚合为簇、视口外裁剪，故渲染规模受控，
 *  可将上限提高到 300 覆盖更广地理范围；如需更多可引入聚类库或原生视口查询。 */
const MAX_PHOTOS = 300;
/** 最多扫描的页数，防止无 GPS 照片过多时无限翻页空转。 */
const MAX_PAGES_SCANNED = 20;

export function useGeotaggedPhotos() {
  const { status, requestPermission } = useMediaLibraryPermission();
  const [photos, setPhotos] = useState<GeoTaggedPhoto[]>([]);
  const [loading, setLoading] = useState(false);

  // 互斥锁，防 refresh 与权限触发并发重复请求
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const collected: GeoTaggedPhoto[] = [];
      let offset = 0;
      let pagesScanned = 0;

      while (collected.length < MAX_PHOTOS && pagesScanned < MAX_PAGES_SCANNED) {
        const assets = await new Query()
          .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
          .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
          .limit(MEDIA_PAGE_SIZE)
          .offset(offset)
          .exe();

        if (assets.length === 0) break; // 没有更多照片

        const pagePhotos = await materializeAssets(assets, async (a): Promise<GeoTaggedPhoto | null> => {
          try {
            // 只读轻量元数据：getLocation/getCreationTime 不解码、不触发 iCloud 下载。
            // 渲染用的图片由 id（iOS 为 ph://）按需加载缩略图，不在此处 getUri（原图 + 下载）。
            const [creationTime, location] = await Promise.all([a.getCreationTime(), a.getLocation()]);
            if (!location) return null; // 无 GPS，跳过
            return {
              id: a.id,
              creationTime: creationTime ?? 0,
              latitude: location.latitude,
              longitude: location.longitude,
            };
          } catch (e) {
            // Android 未授 ACCESS_MEDIA_LOCATION 时 getLocation() 会抛异常；记录而非吞掉
            console.warn('Failed to read photo geotag:', e);
            return null;
          }
        });

        collected.push(...pagePhotos);
        // 渐进式更新：每页处理完即刷新，标记逐步出现在地图上
        setPhotos([...collected]);

        offset += MEDIA_PAGE_SIZE;
        pagesScanned += 1;
        if (assets.length < MEDIA_PAGE_SIZE) break; // 最后一页
      }
    } catch (e) {
      console.error('Failed to load geotagged photos:', e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // 权限通过后触发加载（limited access 时 status 仍为 granted）
  useEffect(() => {
    if (status === 'undetermined') {
      requestPermission();
      return;
    }
    if (status === 'granted') {
      load();
    }
  }, [status, load, requestPermission]);

  // 媒体库变化（拍照 / 删除 / 编辑）时增量刷新：重新扫描 GPS 照片。
  // 原生侧有订阅；卸载时 remove 防泄漏。
  useEffect(() => {
    const sub = addListener(() => {
      load();
    });
    return () => sub.remove();
  }, [load]);

  return { photos, loading, refresh: load };
}
