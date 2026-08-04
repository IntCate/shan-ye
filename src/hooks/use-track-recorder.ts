/**
 * 轨迹录制 hook：管理「开始/暂停/继续/结束」状态机与 GPS 轨迹点采集。
 *
 * - 状态机：idle（未开始）→ recording（录制中，可暂停/结束）→ paused（已暂停，可继续/结束）→ 结束保存
 * - 定位：watchPositionAsync 高频订阅（1s / 2m，生命周期复用 usePositionWatch），
 *   每次更新记录一个轨迹点（经纬度+海拔+时间戳）并累计相邻点大圆距离作为总里程；
 *   暂停时移除订阅（省电），继续时重建
 * - 耗时：recording 期间每秒 tick 刷新（暂停期间不计，elapsedRef 累计）
 * - 当前海拔：取最近一次定位的海拔；定位暂停期间冻结为最后值
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { usePositionWatch } from '@/hooks/use-position-watch';
import type { RoutePoint } from '@/types/route';
import { distanceMeters } from '@/utils/geo';

export type TrackStatus = 'idle' | 'recording' | 'paused';

type UseTrackRecorderResult = {
  status: TrackStatus;
  /** 已记录轨迹点（含海拔/时间戳）。 */
  points: RoutePoint[];
  /** 总里程（米，相邻点大圆距离累计）。 */
  distanceM: number;
  /** 有效录制耗时（毫秒，暂停期间不计）。 */
  elapsedMs: number;
  /** 当前海拔（米），暂无定位值时 null。 */
  altitudeM: number | null;
  /** 开始/重新开始录制；权限拒绝或定位失败返回 false。 */
  start: () => Promise<boolean>;
  /** 暂停录制（保留已记录点与累计里程）。 */
  pause: () => void;
  /** 从暂停继续录制。 */
  resume: () => void;
  /** 结束录制并返回轨迹点（调用方负责保存）；内部状态重置为 idle。 */
  stop: () => RoutePoint[];
};

export function useTrackRecorder(): UseTrackRecorderResult {
  const [status, setStatus] = useState<TrackStatus>('idle');
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [altitudeM, setAltitudeM] = useState<number | null>(null);

  // refs 镜像：定位订阅回调/定时器内读取最新值，避免闭包陈旧
  const statusRef = useRef<TrackStatus>('idle');
  const pointsRef = useRef<RoutePoint[]>([]);
  const distanceRef = useRef(0);
  const elapsedRef = useRef(0);
  const segmentStartRef = useRef(0); // 当前 recording 段的起始时间戳
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 耗时显示刷新：每秒触发一次 state 更新，供面板展示（实际值由 refs 实时计算）。 */
  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setElapsedMs(
        elapsedRef.current +
          (statusRef.current === 'recording' ? Date.now() - segmentStartRef.current : 0)
      );
    }, 1000);
  }, [stopTimer]);

  /** 定位回调：记录点 + 累计里程 + 海拔。 */
  const onLocation = useCallback((loc: Location.LocationObject) => {
    const { latitude, longitude, altitude } = loc.coords;
    const prev = pointsRef.current[pointsRef.current.length - 1];
    const point: RoutePoint = {
      latitude,
      longitude,
      elevation: altitude ?? undefined,
      time: Date.now(),
    };
    if (prev) {
      distanceRef.current += distanceMeters(prev, point);
    }
    pointsRef.current = [...pointsRef.current, point];
    if (altitude != null) setAltitudeM(altitude);
    setPoints(pointsRef.current);
    setDistanceM(distanceRef.current);
  }, []);

  // 定位生命周期（权限/快照/订阅/清理）复用公共 hook，本 hook 仅保留轨迹点采集
  const { requestPermissionAndLocate, startWatch, stopWatch } = usePositionWatch(
    { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 2 },
    onLocation
  );

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const pos = await requestPermissionAndLocate();
      if (!pos) return false;
      // 重置本轮录制状态
      pointsRef.current = [
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          elevation: pos.coords.altitude ?? undefined,
          time: Date.now(),
        },
      ];
      distanceRef.current = 0;
      elapsedRef.current = 0;
      segmentStartRef.current = Date.now();
      setPoints(pointsRef.current);
      setDistanceM(0);
      setElapsedMs(0);
      setAltitudeM(pos.coords.altitude ?? null);
      await startWatch();
      statusRef.current = 'recording';
      setStatus('recording');
      startTimer();
      return true;
    } catch (e) {
      console.warn('[use-track-recorder] start failed', e);
      return false;
    }
  }, [startWatch, startTimer]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'recording') return;
    elapsedRef.current += Date.now() - segmentStartRef.current;
    stopWatch();
    stopTimer();
    statusRef.current = 'paused';
    setStatus('paused');
    setElapsedMs(elapsedRef.current);
  }, [stopWatch, stopTimer]);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    segmentStartRef.current = Date.now();
    startWatch();
    statusRef.current = 'recording';
    setStatus('recording');
    startTimer();
  }, [startWatch, startTimer]);

  /** 结束：清理订阅/定时器，返回轨迹点并重置为 idle。 */
  const stop = useCallback((): RoutePoint[] => {
    stopWatch();
    stopTimer();
    statusRef.current = 'idle';
    setStatus('idle');
    const recorded = pointsRef.current;
    pointsRef.current = [];
    distanceRef.current = 0;
    elapsedRef.current = 0;
    segmentStartRef.current = 0;
    setPoints([]);
    setDistanceM(0);
    setElapsedMs(0);
    setAltitudeM(null);
    return recorded;
  }, [stopWatch, stopTimer]);

  // 卸载清理：定位订阅由 usePositionWatch 内部自动清理；此处仅清理计时器
  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, [stopTimer]);

  return { status, points, distanceM, elapsedMs, altitudeM, start, pause, resume, stop };
}
