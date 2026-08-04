/**
 * 相册数据层 hook。
 *
 * 负责：分页 Query 查询设备图片+视频（按创建时间倒序），并把每个 Asset 的异步 getter
 * （getUri/getMediaType/getWidth/getHeight/getCreationTime/getDuration）批量物化为同步
 * PhotoItem，供网格与查看器直接渲染。
 *
 * SDK 57 关键点：Asset 同步属性只剩 id，uri/尺寸/类型全为异步 getter，故用 Promise.allSettled
 * 并发取值；单条 asset 取值失败不影响整页（filter 掉 null）。
 *
 * 权限由外层 PhotoAlbum 容器的权限门控把关：权限通过后才挂载本 hook。
 */

import { useEffect, useRef, useState } from 'react';
import { AssetField, MediaType, Query } from 'expo-media-library';

import { MEDIA_PAGE_SIZE } from '@/constants/media';
import { materializeAssets } from '@/services/media-library';
import type { PhotoItem } from '@/types/photo-album';

export function usePhotoAlbum() {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // pageRef 非响应式（React Compiler 下保持 ref 语义），跟踪下次查询 offset
  const pageRef = useRef(0);
  // 互斥锁，防 onEndReached 抖动重复请求
  const loadingRef = useRef(false);

  const loadPage = async (reset: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const offset = reset ? 0 : pageRef.current;
    if (reset) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const assets = await new Query()
        .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
        .limit(MEDIA_PAGE_SIZE)
        .offset(offset)
        .exe();

      const pageItems = await materializeAssets(assets, async (a): Promise<PhotoItem | null> => {
        const [uri, mediaType, width, height, creationTime, duration] = await Promise.all([
          a.getUri(),
          a.getMediaType(),
          a.getWidth(),
          a.getHeight(),
          a.getCreationTime(),
          a.getDuration(),
        ]);
        if (mediaType !== MediaType.IMAGE && mediaType !== MediaType.VIDEO) return null;
        return {
          asset: a,
          id: a.id,
          uri,
          mediaType,
          width,
          height,
          creationTime: creationTime ?? 0,
          duration,
        };
      });

      setItems((prev) => (reset ? pageItems : [...prev, ...pageItems]));
      setHasMore(assets.length === MEDIA_PAGE_SIZE);
      pageRef.current = reset ? MEDIA_PAGE_SIZE : offset + MEDIA_PAGE_SIZE;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMore = () => {
    if (!loadingRef.current && hasMore) loadPage(false);
  };
  const refresh = () => loadPage(true);

  // mount 时加载首页
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, loading, refreshing, hasMore, error, loadMore, refresh };
}
