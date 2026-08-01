/**
 * 设备朝向 hook，封装 expo-location 的 watchHeadingAsync（磁力计真北朝向）。
 *
 * 与 react-native-maps 的 onUserLocationChange.coordinate.heading（行进方向，需移动才有值）不同，
 * 磁力计朝向由设备姿态决定，静止时也可读出，更贴合"罗盘"语义。
 *
 * 平台支持：
 *   - iOS / Android：watchHeadingAsync 真磁力计
 *   - Web：expo-location 不支持，直接 available=false（项目以 Web 为开发预览端，不要求完整功能）
 *
 * trueHeading = -1 表示权限未授予或朝向不可用（iOS 文档约定），本 hook 将其归一化为 null。
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type HeadingState = {
  /** 真北朝向角度（0-360，0=正北，90=正东）；null = 不可用或权限未授予。 */
  heading: number | null;
  /** 磁力计校准等级 0-3（3=高精度，<20° 误差；0=不可用，>50° 误差）。 */
  accuracy: number;
  /** 当前平台是否支持磁力计朝向。Web 端恒为 false。 */
  available: boolean;
};

const INITIAL: Omit<HeadingState, 'available'> = { heading: null, accuracy: 0 };

export function useHeading(): HeadingState {
  const [state, setState] = useState(INITIAL);
  const available = Platform.OS === 'ios' || Platform.OS === 'android';

  useEffect(() => {
    if (!available) return;
    let sub: Location.LocationSubscription | null = null;
    let active = true;

    (async () => {
      try {
        // watchHeadingAsync 在 iOS 上仍需位置权限（trueHeading 依赖位置）；
        // 未授权时 trueHeading 会返回 -1，magHeading 仍可用但语义偏弱，统一判定为不可用。
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!active || perm.status !== 'granted') return;

        sub = await Location.watchHeadingAsync((h) => {
          // trueHeading < 0 表示朝向不可用（无权限 / 无磁场 / 设备不支持）
          if (h.trueHeading < 0) {
            setState((s) => (s.heading === null ? s : { heading: null, accuracy: h.accuracy }));
            return;
          }
          setState({ heading: h.trueHeading, accuracy: h.accuracy });
        });
      } catch (e) {
        // 模拟器无磁力计时会失败，静默降级为不可用
        console.warn('[use-heading] watchHeadingAsync failed', e);
      }
    })();

    return () => {
      active = false;
      sub?.remove();
    };
  }, [available]);

  return { ...state, available };
}
