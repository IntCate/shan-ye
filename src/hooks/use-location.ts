/**
 * 用户定位 hook，封装 expo-location。
 *
 * 仅前台定位（首页不需要后台跟踪）。权限拒绝或定位不可用时降级返回 null，
 * 调用方应保持地图在初始坐标，不阻塞其它交互。
 */

import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

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
      return point;
    } catch (e) {
      // 例如 iOS 模拟器未设置 Location 时会超时
      setStatus('unavailable');
      setError(`定位不可用：${(e as Error).message ?? e}`);
      console.warn('[use-location] requestAndLocate failed', e);
      return null;
    }
  }, []);

  return { coords, status, error, requestAndLocate };
}
