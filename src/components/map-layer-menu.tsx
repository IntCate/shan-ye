/**
 * 地图图层显示开关（native）——多选器。
 *
 * 浮层卡片，列出可勾选的图层项（路径 / 照片 / 标点）。点击项切换勾选状态（不关闭浮层），
 * 由业务侧（首页）控制地图上 Polyline / Photo Marker / 收藏标点 Marker 的显隐。
 *
 * 地图模式（标准/卫星/天气）的选择已移至「我的」面板，本组件仅负责图层显隐。
 */

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { BubbleTail } from '@/components/bubble-tail';
import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Glass, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 可勾选的图层项。 */
export type LayerKey = 'routes' | 'photos' | 'placemarks';

const OPTIONS: { label: string; value: LayerKey }[] = [
  { label: '路径', value: 'routes' },
  { label: '照片', value: 'photos' },
  { label: '标点', value: 'placemarks' },
];

export function MapLayerMenu({
  layers,
  onToggle,
}: {
  /** 各图层的勾选状态。 */
  layers: Record<LayerKey, boolean>;
  /** 切换指定图层的勾选状态。 */
  onToggle: (key: LayerKey) => void;
}) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  return (
    <View style={styles.wrap}>
      <GlassPanel style={styles.cardOuter} contentStyle={styles.cardContent}>
        {OPTIONS.map((opt) => {
          const isChecked = layers[opt.value];
          return (
            <Pressable
              key={opt.value}
              onPress={() => onToggle(opt.value)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <ThemedText type="small" style={styles.label}>
                {opt.label}
              </ThemedText>
              {/* 多选框：勾选用 checkmark.square.fill，未勾选用 square */}
              <SymbolView
                name={
                  isChecked
                    ? { ios: 'checkmark.square.fill', android: 'check_box', web: 'check_box' }
                    : { ios: 'square', android: 'check_box_outline_blank', web: 'check_box_outline_blank' }
                }
                size={18}
                tintColor={theme.text}
              />
            </Pressable>
          );
        })}
      </GlassPanel>
      {/* 右侧尾巴：向右三角形指向「图层」按钮，颜色与玻璃 overlay 同色以无缝衔接 */}
      <BubbleTail
        direction="right"
        color={isDark ? Glass.overlayDark : Glass.overlayLight}
        size={8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /** 卡片 + 尾巴的水平容器：尾巴垂直居中贴在卡片右侧。 */
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** 外层：圆角 + 阴影 + 最小宽度（不裁剪，阴影可见） */
  cardOuter: {
    borderRadius: 12,
    minWidth: 150,
    ...Shadow.lg,
  },
  /** 内层内容：纵向 padding 移到 contentStyle */
  cardContent: {
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  label: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
