"use no memo";
/**
 * 地图搜索框：输入地址 → Nominatim 返回结果 → 选中跳转。
 *
 * 位于屏幕底部（原 Tab 栏位置）。输入框固定；状态/结果列表 absolute 定位在输入框
 * 上方向上展开（向下展开会被屏幕底部裁切）。宽度受 MaxContentWidth 约束居中。
 * 结果区使用 Reanimated FadeIn 淡入。
 *
 * 键盘避让：搜索框贴近屏幕底部，iOS 键盘弹出时整体上移键盘高度（Android 系统
 * adjustResize 自动顶起，无需处理）；使用 withTiming 与键盘动画同步，避免被遮挡。
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { GlassPanel, liquidGlassAvailable } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Shadow, Spacing } from '@/constants/theme';
import { useGeocodeSearch } from '@/hooks/use-geocode-search';
import { useTheme } from '@/hooks/use-theme';
import type { GeoPoint } from '@/types/map';

export type MapSearchBarHandle = {
  /** 收起搜索：输入框失焦（键盘收起）、隐藏结果列表并清空已输入文字。 */
  dismiss: () => void;
};

type MapSearchBarProps = {
  onSelect: (point: GeoPoint, title: string) => void;
  /** 搜索会话激活变化通知：聚焦开始 true，会话结束（选中结果 / dismiss）false。
   *  与 blur 事件解耦（iOS 键盘收起会触发 blur 但会话未结束），父级据此刻
   *  隐藏/恢复右侧悬浮按钮组，保证按钮组与结果列表严格互斥不互相遮挡。 */
  onFocusChange?: (active: boolean) => void;
};

export const MapSearchBar = forwardRef<MapSearchBarHandle, MapSearchBarProps>(
  function MapSearchBar({ onSelect, onFocusChange }, ref) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [query, setQuery] = useState('');
    const { results, loading, error, hasResults } = useGeocodeSearch(query);
    // 输入框区块高度：结果列表 absolute 定位在其正上方（向上展开）
    const [inputHeight, setInputHeight] = useState(0);
    // 搜索会话激活：输入框聚焦后结果列表才显示；点击地图等外部区域后关闭
    const [active, setActive] = useState(false);
    const inputRef = useRef<TextInput>(null);
    // 键盘避让偏移：键盘弹出时搜索框整体上移，底部与键盘顶部仅留 8pt 间距
    // （上移量 = 键盘高 − 底部安全区，扣掉搜索框原有 bottom 定位；仅 iOS，Android 系统 resize 顶起）
    const kbOffset = useSharedValue(0);

    useImperativeHandle(ref, () => ({
      dismiss: () => {
        inputRef.current?.blur();
        setActive(false);
        setQuery(''); // 取消聚焦：清空已输入内容，下次聚焦从空白开始
        onFocusChange?.(false);
      },
    }));

    const handleSelect = (point: GeoPoint, title: string) => {
      onSelect(point, title);
      inputRef.current?.blur();
      setActive(false);
      onFocusChange?.(false);
    };

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
      kbOffset.value = withTiming(Math.max(0, e.endCoordinates.height - insets.bottom), {
        duration: 250,
      });
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      kbOffset.value = withTiming(0, { duration: 250 });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [kbOffset, insets.bottom]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -kbOffset.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, wrapStyle]}>
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
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onFocus={() => {
                setActive(true);
                onFocusChange?.(true);
              }}
              placeholder="查找地点与地址、图片、轨迹"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text }]}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
        </GlassPanel>
      </View>

      {/* 状态/结果区：搜索会话激活时 absolute 在输入框上方向上展开（搜索框位于屏幕底部，向下会越界）。
          统一以 active 为门槛：结果/状态与按钮组（父级按 onFocusChange 同步隐藏）严格互斥，
          避免 iOS 键盘收起触发 blur 后按钮恢复、结果列表仍开着导致互相遮挡。 */}
      {active && (loading || error || hasResults) && inputHeight > 0 && (
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
                    onPress={() =>
                      handleSelect({ latitude: r.latitude, longitude: r.longitude }, r.displayName)
                    }>
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
    </Animated.View>
  );
  },
);

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
