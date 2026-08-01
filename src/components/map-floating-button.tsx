/**
 * 地图悬浮按钮（通用）：方形圆角 44×44 液态玻璃样式，复用于定位 / 图层 / 我的 等悬浮操作。
 * 图标用 expo-symbols 三平台 name（ios / android / web）。
 */

import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { GlassPanel, liquidGlassAvailable } from '@/components/glass-panel';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type MapFloatingButtonProps = {
  /** expo-symbols 三平台图标名。 */
  symbol: SymbolName;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

export function MapFloatingButton({
  symbol,
  onPress,
  accessibilityLabel,
  style,
}: MapFloatingButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
      <GlassPanel style={styles.inner} contentStyle={styles.innerContent}>
        {/* iOS 26 Liquid Glass：不设 tintColor，让系统对 contentView 内的图标做 luminance 适配
            （随玻璃背景变白/变深，与 NativeTabs 图标同款）；其他平台仍用主题色保证可见性。 */}
        <SymbolView name={symbol} size={20} tintColor={liquidGlassAvailable ? undefined : theme.text} />
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /** 外层：尺寸 + 圆角（shadow 在父 Pressable 的 styles.button 上，不在此层） */
  inner: {
    width: 44,
    height: 44,
    borderRadius: Spacing.three,
  },
  /** 内层内容：居中图标（放最上层，避免被 overlay 遮住） */
  innerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** 用 scale 而非 opacity：iOS 26 Liquid Glass 下父视图 opacity<1 会导致玻璃不渲染。 */
  pressed: {
    transform: [{ scale: 0.92 }],
  },
});
