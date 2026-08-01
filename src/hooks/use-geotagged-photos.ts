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
 * - 单条 asset 取值失败（如 Android 未授 ACCESS_MEDIA_LOCATION 抛异常）用 try/catch 兜底，
 *   console.warn 记录、不吞异常，不影响整页其他照片。
 *
 * 权限：undetermined → 主动请求；granted（含 limited access）→ 加载；denied → 不加载。
 * 参照 src/hooks/use-photo-album.ts 的分页 Query + Promise.allSettled 批量物化模式。
 */

import { useEffect, useRef, useState } from 'react';
import { AssetField, MediaType, Query, usePermissions } from 'expo-media-library';

import type { GeoTaggedPhoto } from '@/types/geotagged-photo';

/** 每页查询数量（与相册一致）。 */
const PAGE_SIZE = 60;
/** 地图上最多展示的照片标记数。图片 Marker 较原生大头针更重（每张需加载并渲染位图），
 *  故上限低于相册分页总量，兼顾可视密度与性能；如需更多可后续引入聚类。 */
const MAX_PHOTOS = 100;
/** 最多扫描的页数，防止无 GPS 照片过多时无限翻页空转。 */
const MAX_PAGES_SCANNED = 20;

export function useGeotaggedPhotos() {
  const [perm, requestPermission] = usePermissions();
  const [photos, setPhotos] = useState<GeoTaggedPhoto[]>([]);
  const [loading, setLoading] = useState(false);

  // 互斥锁，防 refresh 与权限触发并发重复请求
  const loadingRef = useRef(false);

  const load = async () => {
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
          .limit(PAGE_SIZE)
          .offset(offset)
          .exe();

        if (assets.length === 0) break; // 没有更多照片

        const settled = await Promise.allSettled(
          assets.map(async (a): Promise<GeoTaggedPhoto | null> => {
            try {
              const [uri, creationTime, location] = await Promise.all([
                a.getUri(),
                a.getCreationTime(),
                a.getLocation(),
              ]);
              if (!location) return null; // 无 GPS，跳过
              return {
                id: a.id,
                uri,
                creationTime: creationTime ?? 0,
                latitude: location.latitude,
                longitude: location.longitude,
              };
            } catch (e) {
              // Android 未授 ACCESS_MEDIA_LOCATION 时 getLocation() 会抛异常；记录而非吞掉
              console.warn('Failed to read photo geotag:', e);
              return null;
            }
          })
        );

        const pagePhotos = settled
          .filter((s): s is PromiseFulfilledResult<GeoTaggedPhoto | null> => s.status === 'fulfilled')
          .map((s) => s.value)
          .filter((v): v is GeoTaggedPhoto => v !== null);

        collected.push(...pagePhotos);
        // 渐进式更新：每页处理完即刷新，标记逐步出现在地图上
        setPhotos([...collected]);

        offset += PAGE_SIZE;
        pagesScanned += 1;
        if (assets.length < PAGE_SIZE) break; // 最后一页
      }
    } catch (e) {
      console.error('Failed to load geotagged photos:', e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // 权限通过后触发加载（limited access 时 status 仍为 granted）
  useEffect(() => {
    if (perm?.status === 'undetermined') {
      requestPermission();
      return;
    }
    if (perm?.status === 'granted') {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perm?.status]);

  return { photos, loading, refresh: load };
}
