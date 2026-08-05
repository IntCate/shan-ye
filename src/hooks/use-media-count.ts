/**
 * 设备媒体总数 hook（native）。
 *
 * 供「我的」面板统计「照片」数量：查询设备相册中图片的总数（不含视频）。
 * 与相册网格口径一致（网格数据层只查询图片，见 use-photo-album；视频因 iOS 18+
 * 系统限制被数据层跳过）。
 * 权限未授权时返回 0；授权后用 expo-media-library/legacy 的 getAssetsAsync({ first: 1 })
 * 读取 totalCount，无需拉取全部资源（SDK 57 新 Query API 无 count，legacy 接口保留 totalCount）。
 */

import { getAssetsAsync, MediaType } from 'expo-media-library/legacy';
import { useEffect, useState } from 'react';

import { useMediaLibraryPermission } from '@/hooks/use-media-library-permission';

export function useMediaCount(): number {
  const { granted } = useMediaLibraryPermission();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!granted) return;
    let active = true;
    (async () => {
      try {
        const info = await getAssetsAsync({
          first: 1,
          mediaType: MediaType.photo,
        });
        if (active) setCount(info.totalCount);
      } catch (e) {
        // 不吞异常：记录详情，面板统计回退为 0
        console.error('[use-media-count] 获取媒体总数失败', e);
      }
    })();
    return () => {
      active = false;
    };
  }, [granted]);

  return count;
}
