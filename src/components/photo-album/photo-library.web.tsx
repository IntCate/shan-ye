/**
 * 照片库组件（Web 占位）。
 *
 * 不 import expo-media-library / expo-video（Web 无设备媒体库，会运行时报错）。
 * Metro 在 Web 平台优先解析 .web.tsx，因此 ProfileSheet import 的 PhotoLibrary 在 Web 端
 * 实际拿到本文件。导出签名与 native 版本一致（无 props）。
 */

import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export function PhotoLibrary() {
  return (
    <ThemedView type="backgroundElement" style={styles.placeholder}>
      <ThemedText type="small" themeColor="textSecondary">
        相册暂不支持 Web 端
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
    borderRadius: 12,
  },
});
