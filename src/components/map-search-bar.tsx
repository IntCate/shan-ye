/**
 * 地图搜索框：输入地址 → Nominatim 返回结果 → 选中跳转。
 *
 * 浮在地图顶部，宽度受 MaxContentWidth 约束居中。
 * 结果区使用 Reanimated FadeIn，与 src/components/ui/collapsible.tsx 动画风格一致。
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GlassPanel } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
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

  return (
    <GlassPanel style={styles.containerOuter} contentStyle={styles.containerContent}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="查找地点"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }]}
        returnKeyType="search"
        autoCorrect={false}
      />

      {(loading || error) && (
        <View style={styles.statusRow}>
          {loading && <ThemedText type="small" themeColor="textSecondary">搜索中…</ThemedText>}
          {error && <ThemedText type="small" themeColor="textSecondary">{error}</ThemedText>}
        </View>
      )}

      {hasResults && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.resultsWrap}>
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
        </Animated.View>
      )}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  /** 外层：承载阴影 + 圆角 + 布局（不裁剪，阴影可见） */
  containerOuter: {
    maxWidth: MaxContentWidth,
    width: '100%',
    borderRadius: Spacing.three,
    // 轻微阴影，让浮层在卫星图上更清晰
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /** 内层内容：padding/gap 移到 contentStyle，避免被 ClipView 裁剪影响 */
  containerContent: {
    padding: Spacing.two,
    gap: Spacing.one,
  },
  input: {
    fontSize: 16,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  statusRow: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  resultsWrap: {
    maxHeight: 300,
  },
  resultsScroll: {
    flexGrow: 0,
  },
  resultRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  pressedRow: {
    opacity: 0.6,
  },
});
