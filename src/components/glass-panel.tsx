/**
 * 液态玻璃容器：统一首页浮层 + web 底部栏的玻璃样式，与 NativeTabs 系统材质对齐。
 *
 * 平台分流：
 *   - iOS 26+：expo-glass-effect 的 GlassView（原生 UIVisualEffectView Liquid Glass），
 *     与 NativeTabs 底部栏同源材质，折射/高光一致。
 *   - 其他平台（Android / Web / 旧 iOS）：expo-blur 的 BlurView + 半透明 overlay 降级。
 *
 * 结构：
 *   - iOS 26+（GlassView）：OuterView(shadow+布局) → GlassView(contentStyle+borderRadius+overflow:hidden)。
 *     children 进入 GlassView 的 contentView，系统对其自动做 luminance 适配（图标/文字随玻璃变色）。
 *   - 降级（BlurView）：OuterView(shadow+borderRadius+布局) → ClipView(absoluteFill, BlurView+overlay)
 *     + ContentView(contentStyle)；阴影与裁剪分层，因 overflow:hidden 会裁掉 shadow。
 *
 * ⚠️ Liquid Glass 已知限制：GlassView 或其任意父视图 opacity<1 会导致玻璃不渲染。
 *    故按钮按压反馈不能用 opacity，须用 transform:scale（见 map-floating-button）。
 *
 * BubbleTail 调用方应使用 Glass.overlayLight/Dark 作为 color，与降级路径 overlay 同色以保证无缝；
 * iOS 26 原生玻璃路径无 overlay，尾巴为尽力匹配（半透明近似）。
 */

import { type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

import { Glass } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * 双重校验确保 Liquid Glass 真正可用，否则降级到 BlurView：
 *   - isLiquidGlassAvailable：编译期 + Info.plist（UIDesignRequiresCompatibility=false）层面是否启用；
 *     若为 false，GlassView 会退化为透明 View（无模糊），比 BlurView 更差，必须降级。
 *   - isGlassEffectAPIAvailable：运行时设备 API 是否可用（部分 iOS 26 beta 缺失会崩溃）。
 * 两者均仅 iOS 可安全调用，用 Platform 短路守卫。
 */
export const liquidGlassAvailable =
  Platform.OS === 'ios' &&
  typeof isLiquidGlassAvailable === 'function' &&
  isLiquidGlassAvailable() &&
  typeof isGlassEffectAPIAvailable === 'function' &&
  isGlassEffectAPIAvailable();

export type GlassPanelProps = Omit<ViewProps, 'style'> & {
  /** BlurView 模糊强度(1-100)，默认 Glass.intensity；仅降级路径生效。 */
  intensity?: number;
  /** 外层样式：shadow + borderRadius + 布局/margin/position */
  style?: StyleProp<ViewStyle>;
  /** 内层内容样式：padding / gap / flexDirection 等 */
  contentStyle?: StyleProp<ViewStyle>;
  /** 是否刷半透明叠加层（增强文字对比 + 供 BubbleTail 匹配色），默认 true；仅降级路径生效。 */
  overlay?: boolean;
  children?: ReactNode;
};

export function GlassPanel({
  intensity,
  style,
  contentStyle,
  overlay = true,
  children,
  ...rest
}: GlassPanelProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const overlayColor = isDark ? Glass.overlayDark : Glass.overlayLight;

  // borderRadius 从外层 style 提取，复用到内层裁剪视图（GlassView / ClipView），
  // 保证阴影圆角 = 内容裁剪圆角。
  const flat = StyleSheet.flatten(style) ?? {};
  const radius = flat.borderRadius ?? 0;

  // iOS 26+：原生 Liquid Glass。children 直接放进 GlassView 的 contentView，系统对其自动做
  // luminance 适配（图标/文字随玻璃背景变色），与 NativeTabs 图标同款效果。
  // 外层 View 仅承载 shadow（UIVisualEffectView 不宜直接画阴影）；GlassView 兼顾玻璃材质 +
  // 圆角裁剪 + 内容布局。borderRadius + overflow:hidden 让玻璃与 contentView 子元素都按圆角裁剪。
  if (liquidGlassAvailable) {
    return (
      <View style={style} {...rest}>
        <GlassView
          style={[contentStyle, { borderRadius: radius, overflow: 'hidden' }]}
          glassEffectStyle="regular"
          colorScheme={isDark ? 'dark' : 'light'}>
          {children}
        </GlassView>
      </View>
    );
  }

  // 降级：BlurView 模糊 + 半透明 overlay（Android / Web / 旧 iOS）
  return (
    <View style={style} {...rest}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView
          intensity={intensity ?? Glass.intensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        {overlay && (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]}
            pointerEvents="none"
          />
        )}
      </View>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}
