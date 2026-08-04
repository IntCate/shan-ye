/**
 * 地图搜索框：输入地址 → Nominatim 返回结果 → 选中跳转。
 *
 * 位于屏幕底部（原 Tab 栏位置）。输入框固定；状态/结果列表 absolute 定位在输入框
 * 上方向上展开（向下展开会被屏幕底部裁切）。宽度受 MaxContentWidth 约束居中。
 * 结果区使用 Reanimated FadeIn 淡入。
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { GlassPanel, liquidGlassAvailable } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Shadow, Spacing } from '@/constants/theme';
import { useGeocodeSearch } from '@/hooks/use-geocode-search';
import { useTheme } from '@/hooks/use-theme';
import type { GeoPoint } from '@/types/map';

type MapSearchBarProps = {
  onSelect: (point: GeoPoint, title: string) => void;
};

export function MapSearchBar({ onSelect }: MapSearchBarProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const { results, loading, error, hasResults } = useGeocodeSearch(query);
  // 输入框区块高度：结果列表 absolute 定位在其正上方（向上展开）
  const [inputHeight, setInputHeight] = useState(0);

  return (
    <View style={styles.wrap}>
      {/* 输入框（固定区块，onLayout 测量高度） */}
      <View onLayout={(e) => setInputHeight(e.nativeEvent.layout.height)}>
        <GlassPanel style={styles.containerOuter} contentStyle={styles.containerContent}>
          <View style={styles.inputRow}>
            <SymbolView
              name="magnifyingglass"
              size={18}
              tintColor={liquidGlassAvailable ? undefined : theme.textSecondary}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="查找地点与地址、图片、轨迹"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text }]}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
        </GlassPanel>
      </View>

      {/* 状态/结果区：absolute 在输入框上方向上展开（搜索框位于屏幕底部，向下会越界） */}
      {(loading || error || hasResults) && inputHeight > 0 && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[styles.resultsOverlay, { bottom: inputHeight + Spacing.one }]}>
          <GlassPanel style={styles.resultsCard} contentStyle={styles.resultsContent}>
            {(loading || error) && (
              <View style={styles.statusRow}>
                {loading && <ThemedText type="small" themeColor="textSecondary">搜索中…</ThemedText>}
                {error && <ThemedText type="small" themeColor="textSecondary">{error}</ThemedText>}
              </View>
            )}
            {hasResults && (
              <ScrollView style={styles.resultsScroll} keyboardShouldPersistTaps="handled">
                {results.map((r, i) => (
                  <Pressable
                    key={`${r.latitude},${r.longitude},${i}`}
                    style={({ pressed }) => [styles.resultRow, pressed && styles.pressedRow]}
                    onPress={() => onSelect({ latitude: r.latitude, longitude: r.longitude }, r.displayName)}>
                    <ThemedText type="small" numberOfLines={2}>
                      {r.displayName}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </GlassPanel>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** 外层：相对定位容器，撑满父级宽度并约束最大宽度（结果区按此对齐） */
  wrap: {
    position: 'relative',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  /** 输入框外层：承载阴影 + 圆角 + 布局（不裁剪，阴影可见） */
  containerOuter: {
    width: '100%',
    borderRadius: Spacing.four,
    // 轻微阴影，让浮层在卫星图上更清晰
    ...Shadow.lg,
  },
  /** 输入框内层内容：padding/gap 移到 contentStyle，避免被 ClipView 裁剪影响 */
  containerContent: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  /** 图标 + 输入框水平排列 */
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  /** 结果区：absolute 贴输入框上方，向左/右对齐输入框 */
  resultsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    maxHeight: 300,
  },
  resultsCard: {
    borderRadius: Spacing.three,
    ...Shadow.lg,
  },
  resultsContent: {
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  statusRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
  resultsScroll: {
    flexGrow: 0,
    maxHeight: 280,
  },
  resultRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  pressedRow: {
    opacity: 0.6,
  },
});
