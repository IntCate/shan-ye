/**
 * 气泡尾巴（三角形）：CSS border 技法绘制，统一用于各处浮层气泡的指向尾巴。
 *
 * 替代此前散落于 index.tsx(popupTip) / satellite-map.tsx(photoMarkerTail) /
 * map-layer-menu.tsx(tail) 的重复三角形实现，避免参数不一、UI 不统一。
 *
 * 用法：color 应与所附气泡背景色一致以无缝衔接；size 为三角形半宽与长度（等腰直角）。
 * 例：<BubbleTail direction="down" color={theme.backgroundElement} size={6} />
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type TailDirection = 'up' | 'down' | 'left' | 'right';

type BubbleTailProps = {
  /** 尾巴尖端指向的方向。 */
  direction: TailDirection;
  /** 尾巴填充色，应与所附气泡背景色一致。 */
  color: string;
  /** 三角形半宽与长度（px），等腰直角。底边宽 2*size、长度 size。默认 8。 */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function BubbleTail({ direction, color, size = 8, style }: BubbleTailProps) {
  // 按方向设置：唯一着色边宽度=size（长度），其两侧边宽度=size（半宽）并透明，
  // 剩余一边宽度 0，即形成朝该方向的三角形。
  const dirStyle: ViewStyle = (() => {
    switch (direction) {
      case 'down':
        return {
          borderLeftWidth: size,
          borderRightWidth: size,
          borderTopWidth: size,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
        };
      case 'up':
        return {
          borderLeftWidth: size,
          borderRightWidth: size,
          borderBottomWidth: size,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        };
      case 'right':
        return {
          borderTopWidth: size,
          borderBottomWidth: size,
          borderLeftWidth: size,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor: color,
        };
      case 'left':
        return {
          borderTopWidth: size,
          borderBottomWidth: size,
          borderRightWidth: size,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderRightColor: color,
        };
    }
  })();

  return <View style={[styles.tail, dirStyle, style]} />;
}

const styles = StyleSheet.create({
  tail: {
    width: 0,
    height: 0,
  },
});
