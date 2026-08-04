/**
 * 位置持续订阅 hook：统一「权限请求 → 单次快照 → watchPositionAsync 持续订阅 → 清理」生命周期。
 *
 * 供 use-altitude（海拔监测）与 use-track-recorder（轨迹录制）复用，消除两份重复的
 * 权限请求 / 快照 / 订阅管理 / 卸载清理样板。业务处理（海拔提取、轨迹点记录）由
 * onUpdate 回调实现，调用方仅负责在合适的时机 startWatch / stopWatch。
 *
 * 权限语义差异由调用方决策（recorder 权限失败返回 false 提示无法开始，altitude
 * 置 denied 终态），故本 hook 不内建权限分支，仅提供快照辅助函数。
 */

import { useCallback, useEffect, useRef } from 'react';
import * as Location from 'expo-location';

export type PositionWatchOptions = {
  accuracy: Location.Accuracy;
  /** 时间间隔（毫秒），默认 1000。 */
  timeInterval?: number;
  /** 距离间隔（米），默认 0（不按距离过滤）。 */
  distanceInterval?: number;
};

export type UsePositionWatchResult = {
  /** 请求前台定位权限；未授予返回 null，授予返回当前位置快照。 */
  requestPermissionAndLocate: () => Promise<Location.LocationObject | null>;
  /** 开始 watchPositionAsync 持续订阅（options 内建配置）；返回订阅对象。 */
  startWatch: () => Promise<Location.LocationSubscription>;
  /** 停止订阅（幂等）；组件卸载时自动清理。 */
  stopWatch: () => void;
};

export function usePositionWatch(
  options: PositionWatchOptions,
  onUpdate: (loc: Location.LocationObject) => void
): UsePositionWatchResult {
  const subRef = useRef<Location.LocationSubscription | null>(null);
  // options 静态配置：固定捕获，避免调用方每次 render 传入新对象导致 startWatch 重建
  const optionsRef = useRef(options);
  // onUpdate ref 镜像：watch 回调读取最新回调，避免闭包陈旧（订阅长驻、回调可重建）
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const stopWatch = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
  }, []);

  const startWatch = useCallback(async () => {
    stopWatch(); // 幂等：重复开始前先清理旧订阅
    const sub = await Location.watchPositionAsync(optionsRef.current, (loc) => {
      onUpdateRef.current(loc);
    });
    subRef.current = sub;
    return sub;
  }, [stopWatch]);

  const requestPermissionAndLocate = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    return Location.getCurrentPositionAsync({ accuracy: optionsRef.current.accuracy });
  }, []);

  // 卸载清理：移除订阅，防泄漏
  useEffect(() => () => stopWatch(), [stopWatch]);

  return { requestPermissionAndLocate, startWatch, stopWatch };
}
