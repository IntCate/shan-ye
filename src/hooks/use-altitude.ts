/**
 * 海拔监测 hook：持续订阅 GPS 定位获取实时海拔（米）。
 *
 * - start()：请求定位权限 → 单次快照立即显示初值 → 持续订阅（1s）刷新
 * - stop()：停止订阅，状态回到 idle；卸载时订阅由 usePositionWatch 自动清理
 * - samples：会话内最近海拔样本（最多 60 个），供面板绘制迷你折线与最低/最高值
 * - 状态机：idle → locating（权限通过、首个数值出现前）→ active（持续刷新）；
 *   denied（权限拒绝）/ error（定位异常），两类终态可在面板中提示用户
 *
 * 定位生命周期（权限/快照/订阅/清理）复用 usePositionWatch，本 hook 仅保留
 * 海拔提取与样本维护的业务逻辑。
 */

import { useCallback, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { usePositionWatch } from '@/hooks/use-position-watch';

export type AltitudeStatus = 'idle' | 'locating' | 'active' | 'denied' | 'error';

/** 保留的最近海拔样本数（60 秒 ≈ 1 分钟迷你折线）。 */
const MAX_SAMPLES = 60;

type UseAltitudeResult = {
  status: AltitudeStatus;
  /** 当前海拔（米）；暂无数值时 null。 */
  altitudeM: number | null;
  /** 会话内最近海拔样本（升序时间，供折线/刻度条归一化）。 */
  samples: number[];
  /** 开始监测；权限拒绝 / 定位失败时内部置终态，不抛错。 */
  start: () => Promise<void>;
  /** 停止监测（停止订阅并回到 idle）。 */
  stop: () => void;
};

export function useAltitude(): UseAltitudeResult {
  const [status, setStatus] = useState<AltitudeStatus>('idle');
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  const [samples, setSamples] = useState<number[]>([]);
  const samplesRef = useRef<number[]>([]);
  // 订阅进行中标记：防重复 start（公共 hook 不内建「是否在监听」状态）
  const activeRef = useRef(false);

  const { requestPermissionAndLocate, startWatch, stopWatch } = usePositionWatch(
    { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
    useCallback((loc: Location.LocationObject) => {
      const alt = loc.coords.altitude;
      if (alt == null) return;
      setAltitudeM(alt);
      samplesRef.current = [...samplesRef.current.slice(-(MAX_SAMPLES - 1)), alt];
      setSamples(samplesRef.current);
      setStatus((prev) => (prev === 'active' ? prev : 'active'));
    }, [])
  );

  const stop = useCallback(() => {
    stopWatch();
    activeRef.current = false;
    samplesRef.current = [];
    setSamples([]);
    setAltitudeM(null);
    setStatus('idle');
  }, [stopWatch]);

  const start = useCallback(async () => {
    if (activeRef.current) return; // 已在监测中，避免重复订阅
    try {
      const pos = await requestPermissionAndLocate();
      if (!pos) {
        setStatus('denied');
        return;
      }
      activeRef.current = true;
      setStatus('locating');
      // 单次快照：立即拿到首个海拔，避免订阅首包前一直显示 "--"
      const first = pos.coords.altitude;
      if (first != null) {
        samplesRef.current = [first];
        setSamples([first]);
        setAltitudeM(first);
      }
      await startWatch();
      setStatus('active');
    } catch (e) {
      console.warn('[use-altitude] start failed', e);
      setStatus('error');
    }
  }, [requestPermissionAndLocate, startWatch]);

  return { status, altitudeM, samples, start, stop };
}
