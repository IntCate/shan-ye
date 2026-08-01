/**
 * 卫星地图组件（Web 端占位）。
 *
 * 不 import react-native-maps（Web 无原生模块，会运行时报错）。
 * Metro 在 Web 平台优先解析 .web.tsx，因此首页 import 的 SatelliteMap 在 Web 端实际拿到本文件。
 *
 * 导出签名与 native 版本完全一致（forwardRef + SatelliteMapHandle），
 * 首页 ref 代码无需平台分支；animateToRegion 为 no-op。
 */

import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { SatelliteMapHandle, SatelliteMapProps } from '@/types/map';

export const SatelliteMap = forwardRef<SatelliteMapHandle, SatelliteMapProps>(function SatelliteMap(
  _props,
  ref
) {
  useImperativeHandle(ref, () => ({
    animateToRegion: () => {
      // no-op：Web 端不支持卫星地图
    },
  }));

  return (
    <ThemedView type="backgroundElement" style={styles.placeholder}>
      <ThemedText type="subtitle">卫星地图暂不支持 Web 端</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        请在 iOS 或 Android 设备/模拟器上体验完整卫星地图功能。
      </ThemedText>
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
});
