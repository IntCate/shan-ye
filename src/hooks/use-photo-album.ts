/**
 * 相册数据层 hook。
 *
 * 负责：分页 Query 查询设备图片（按创建时间倒序），并把每个 Asset 的异步 getter
 * 批量物化为同步 PhotoItem，供网格与查看器直接渲染。
 *
 * getUri 优化（iOS）：getUri() 触发 iCloud 下载 + 文件复制（isNetworkAccessAllowed=true），
 * 而 iOS 的 Asset.id 即 ph:// localIdentifier，expo-image 原生支持按需加载系统缩略图——
 * 故 iOS 上跳过 getUri，uri 直接赋 id（与地图照片标记 #8 同一优化，每张省一次
 * 下载/复制 + 桥接）；Android 的 id 为 MediaStore 数字 ID 不可渲染，仍取 getUri 的 content://。
 *
 * 只查询图片（MediaType.IMAGE）：iOS 18+ 真机上 AVPlayer 读取相册视频被系统拒绝
 * （expo issue #31620，Code=257），视频缩略图/播放均不可用，故数据层直接跳过视频。
 *
 * SDK 57 关键点：Asset 同步属性只剩 id，uri/尺寸/类型全为异步 getter，故用 Promise.allSettled
 * 并发取值；单条 asset 取值失败不影响整页（filter 掉 null）。
 *
 * 分页策略（游标分页）：不用 offset——媒体库新增照片（排最前）后，固定 offset 会整体偏移
 * 错位（已加载项重复、尾部照片跳过）。改为锚定「本页最后一张照片的创建时间」做 lt 游标：
 * 新增照片只影响最新页，后续页从上次看到的时间继续，已加载项不受影响。
 * creationTime 为毫秒级整数，lt 严格小于保证游标单调递减、无重复、无死循环；
 * 代价：同毫秒跨页边界的照片会跳过（仅批量导入同毫秒多张的罕见场景）。
 *
 * 权限由外层 PhotoAlbum 容器的权限门控把关：权限通过后才挂载本 hook。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { addListener, AssetField, MediaType, Query } from 'expo-media-library';

import { MEDIA_PAGE_SIZE } from '@/constants/media';
import { materializeAssets } from '@/services/media-library';
import type { PhotoItem } from '@/types/photo-album';

export function usePhotoAlbum() {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 分页游标：已加载照片的最小创建时间（lt 查询锚点）。null = 尚未加载（从最新开始）。
  const cursorRef = useRef<number | null>(null);
  // 互斥锁，防 onEndReached 抖动重复请求
  const loadingRef = useRef(false);

  const loadPage = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    // reset（首屏 / 下拉刷新）从最新开始：游标归 null
    if (reset) {
      cursorRef.current = null;
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const query = new Query()
        .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE])
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
        .limit(MEDIA_PAGE_SIZE);
      // 游标分页：只取创建时间早于游标的照片（首屏无游标 = 最新一页），
      // 媒体库新增照片（排最前）不会造成后续页偏移错位
      if (cursorRef.current != null) {
        query.lt(AssetField.CREATION_TIME, cursorRef.current);
      }
      const assets = await query.exe();

      const pageItems = await materializeAssets(assets, async (a): Promise<PhotoItem | null> => {
        const [mediaType, width, height] = await Promise.all([
          a.getMediaType(),
          a.getWidth(),
          a.getHeight(),
        ]);
        if (mediaType !== MediaType.IMAGE) return null;
        // iOS：Asset.id 即 ph:// localIdentifier，expo-image 原生按需加载系统缩略图，
        // 跳过 getUri（iCloud 下载 + 文件复制）；Android：id 为 MediaStore 数字 ID，
        // 必须 getUri 取 content:// 渲染源。
        const uri = Platform.OS === 'ios' ? a.id : await a.getUri();
        return {
          asset: a,
          id: a.id,
          uri,
          mediaType,
          width,
          height,
          duration: null,
        };
      });

      // 游标推进：本页最后一张的创建时间（查询按时间倒序，末项即本页最小时间）。
      // 每页仅 1 次轻量读取；取不到（本页为空 / 时间戳异常）时终止加载，
      // 防止游标不动导致下一页重复返回同批照片（死循环）。
      const last = assets[assets.length - 1];
      const lastTime = last ? await last.getCreationTime() : null;
      if (lastTime != null) cursorRef.current = lastTime;

      setItems((prev) => (reset ? pageItems : [...prev, ...pageItems]));
      setHasMore(lastTime != null && assets.length === MEDIA_PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!loadingRef.current && hasMore) loadPage(false);
  }, [hasMore, loadPage]);
  const refresh = useCallback(() => loadPage(true), [loadPage]);

  // mount 时加载首页
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 媒体库变化（拍照 / 删除 / 编辑）时刷新网格：新照片出现、删除消失，无需手动下拉。
  // 与 useGeotaggedPhotos 的地图标记增量刷新同模式；卸载 remove 防泄漏。
  useEffect(() => {
    const sub = addListener(() => {
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { items, loading, refreshing, hasMore, error, loadMore, refresh };
}
