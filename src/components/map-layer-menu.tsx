/**
 * 地图图层选择器（native）。
 *
 * 浮层卡片，列出可选地图类型；当前选中项带 checkmark。点击选项触发 onSelect，
 * 由业务侧（首页）切换 mapType 并关闭浮层。
 *
 * 现仅「标准地图 / 卫星地图」两项，后续可向 OPTIONS 追加（如地形、3D）。
 */

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { BubbleTail } from '@/components/bubble-tail';
import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Glass, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MapType } from '@/types/map';

const OPTIONS: { label: string; value: MapType }[] = [
  { label: '标准地图', value: 'standard' },
  { label: '卫星地图', value: 'hybrid' },
];

export function MapLayerMenu({
  selected,
  onSelect,
}: {
  selected: MapType;
  onSelect: (type: MapType) => void;
}) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  return (
    <View style={styles.wrap}>
      <GlassPanel style={styles.cardOuter} contentStyle={styles.cardContent}>
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <ThemedText type="small" style={styles.label}>
                {opt.label}
              </ThemedText>
              {isSelected && (
                <SymbolView
                  name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                  size={16}
                  tintColor={theme.text}
                />
              )}
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
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
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
