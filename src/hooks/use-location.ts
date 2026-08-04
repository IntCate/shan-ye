/**
 * 用户定位 hook，封装 expo-location。
 *
 * 仅前台定位（首页不需要后台跟踪）。权限拒绝或定位不可用时返回 null，
 * 调用方应保持地图在初始坐标，不阻塞其它交互。
 *
 * requestAndLocate() 做单次定位快照，用于初始地图区域与「定位」按钮。
 * 地图蓝点（showsUserLocation）由系统持续定位驱动，无需本 hook 订阅
 * watchPositionAsync：此前 watch 的 coords 无人消费，只造成周期性空转
 * 重渲染，且异步订阅在卸载竞态下可能泄漏。
 */

import { useCallback } from 'react';
import * as Location from 'expo-location';

import type { GeoPoint } from '@/types/map';

type LocationState = {
  /** 单次定位：返回当前位置；权限拒绝/定位失败返回 null。 */
  requestAndLocate: () => Promise<GeoPoint | null>;
};

export function useLocation(): LocationState {
  const requestAndLocate = useCallback(async (): Promise<GeoPoint | null> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        // 权限拒绝：静默返回 null，调用方保持地图在初始坐标
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
    } catch (e) {
      // 例如 iOS 模拟器未设置 Location 时会超时
      console.warn('[use-location] requestAndLocate failed', e);
      return null;
    }
  }, []);

  return { requestAndLocate };
}
