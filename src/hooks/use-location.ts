/**
 * 用户定位 hook，封装 expo-location。
 *
 * 仅前台定位（首页不需要后台跟踪）。权限拒绝或定位不可用时降级返回 null，
 * 调用方应保持地图在初始坐标，不阻塞其它交互。
 *
 * requestAndLocate() 做首次单次定位（快速返回用于初始地图区域），
 * 成功后自动启动 watchPositionAsync 持续订阅，coords 会随设备移动实时更新。
 * 组件卸载时自动移除订阅。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { LocationSubscription } from 'expo-location';

import type { GeoPoint } from '@/types/map';

export type LocationStatus = 'idle' | 'granted' | 'denied' | 'unavailable';

export type LocationState = {
  coords: GeoPoint | null;
  status: LocationStatus;
  error: string | null;
  requestAndLocate: () => Promise<GeoPoint | null>;
};

export function useLocation(): LocationState {
  const [coords, setCoords] = useState<GeoPoint | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const subscriptionRef = useRef<LocationSubscription | null>(null);

  // 启动持续位置订阅：coords 随设备移动实时更新
  const startWatch = useCallback(async () => {
    // 已有订阅则不重复启动
    if (subscriptionRef.current) return;
    try {
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 5 },
        (pos) => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      );
      subscriptionRef.current = sub;
    } catch (e) {
      // watch 失败不阻断主流程，首次快照已可用
      console.warn('[use-location] watchPositionAsync failed', e);
    }
  }, []);

  const requestAndLocate = useCallback(async (): Promise<GeoPoint | null> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setStatus('denied');
        setError('定位权限被拒绝');
        return null;
      }
      setStatus('granted');
      setError(null);

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point: GeoPoint = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setCoords(point);
      // 首次快照成功后启动持续订阅，coords 后续实时更新
      startWatch();
      return point;
    } catch (e) {
      // 例如 iOS 模拟器未设置 Location 时会超时
      setStatus('unavailable');
      setError(`定位不可用：${(e as Error).message ?? e}`);
      console.warn('[use-location] requestAndLocate failed', e);
      return null;
    }
  }, [startWatch]);

  // 组件卸载时移除订阅，避免泄漏
  useEffect(() => {
    return () => {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, []);

  return { coords, status, error, requestAndLocate };
}
