/**
 * 「我的」个人中心底部卡片（native）——两段式（收起/展开）。
 *
 * 点击侧边按钮组「我的」按钮后，以 iOS 风格底部卡片从屏幕底部向上滑出。
 *
 * 两段式交互：
 * - 收起态（默认打开）：仅展示头像 + 昵称 + 统计数据（照片数/路径数）。
 *   向上拖拽（或点击展开提示）→ 展开显示完整面板。
 * - 展开态：展示地图模式选择器（横向排列的样图卡片，上图下名，选中项蓝色边框）。
 *   向下拖拽超过阈值 → 回到收起态。
 *
 * translateY 模型（卡片 bottom:0，高度=EXPANDED_HEIGHT，正值向下移动）：
 * - HIDDEN_OFFSET (=EXPANDED_HEIGHT)：完全移出屏幕下方，不可见
 * - COLLAPSED_OFFSET (=EXPANDED_HEIGHT - COLLAPSED_HEIGHT)：下移使仅顶部 COLLAPSED_HEIGHT 可见
 * - EXPANDED_OFFSET (=0)：原位，完整 EXPANDED_HEIGHT 可见
 *
 * 样式与交互与 PhotoDetailSheet 同源：Modal 渲染、遮罩淡入淡出、顶部圆角 + grabber、
 * 整卡拖拽、点击遮罩或抓手关闭。组件常驻挂载，内部按 visible 提前 return。
 */

import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MapType } from '@/types/map';

/** 地图模式选项：图标 + 名称 + value。图标用 SF Symbols，无需外部图片资源。
 *  样图背景色取各模式典型底色，视觉上近似 iOS Maps 的模式选择器缩略图。
 *  symbol 用 as const 断言为字面量类型，匹配 SymbolView name prop 的类型约束。 */
const MAP_OPTIONS = [
  {
    label: '标准地图',
    value: 'standard' as const,
    symbol: { ios: 'map.fill' as const, android: 'map' as const, web: 'map' as const },
    bgColor: '#E8E8E8',
  },
  {
    label: '卫星地图',
    value: 'hybrid' as const,
    symbol: { ios: 'globe.americas.fill' as const, android: 'public' as const, web: 'public' as const },
    bgColor: '#2E3A2A',
  },
  {
    label: '天气地图',
    value: 'weather' as const,
    symbol: { ios: 'cloud.rain.fill' as const, android: 'rainy' as const, web: 'rainy' as const },
    bgColor: '#3A5A7A',
  },
];

/** 收起态可见高度（仅展示头像+昵称+统计）。 */
const COLLAPSED_HEIGHT = 220;
/** 展开态卡片高度（完整面板）。 */
const EXPANDED_HEIGHT = 480;
/** 完全隐藏时的 translateY（卡片整体移出屏幕下方）。 */
const HIDDEN_OFFSET = EXPANDED_HEIGHT;
/** 收起态的 translateY（下移使仅顶部 COLLAPSED_HEIGHT 可见）。 */
const COLLAPSED_OFFSET = EXPANDED_HEIGHT - COLLAPSED_HEIGHT;
/** 展开态的 translateY（原位，完整可见）。 */
const EXPANDED_OFFSET = 0;
/** 滑动动画时长（ms）。 */
const ANIM_DURATION = 300;
/** 回弹动画时长（ms）。 */
const SNAP_DURATION = 200;
/** 遮罩目标透明度。 */
const BACKDROP_OPACITY = 0.5;
/** 展开/回收/关闭的拖拽阈值。 */
const DRAG_THRESHOLD = 80;
/** 触发展开/回收/关闭的下甩/上甩速度。 */
const DISMISS_VELOCITY = 500;
/** 地图模式样图卡片尺寸。 */
const THUMBNAIL_SIZE = 96;
/** 选中态边框色（iOS 系统蓝）。 */
const SELECTED_BORDER_COLOR = '#007AFF';

export function ProfileSheet({
  visible,
  photoCount,
  routeCount,
  mapType,
  onMapTypeChange,
  onClose,
}: {
  visible: boolean;
  photoCount: number;
  routeCount: number;
  mapType: MapType;
  onMapTypeChange: (type: MapType) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  // 卡片当前是否展开。用 ref 同步给手势 worklet 读取（避免闭包陈旧值）。
  const expandedRef = useRef(false);
  // 卡片竖向位移：见文件头 translateY 模型说明
  const translateY = useSharedValue(HIDDEN_OFFSET);
  // 遮罩透明度：初始 0，打开时淡入
  const backdropOpacity = useSharedValue(0);

  // 记录上一次 visible，用于检测 false→true 的「打开」过渡。
  const prevVisibleRef = useRef(false);

  // 打开时（visible 由 false 变为 true）：重置到隐藏态，再动画滑入收起态。
  useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!isOpening) return;
    expandedRef.current = false;
    translateY.value = HIDDEN_OFFSET;
    backdropOpacity.value = 0;
    translateY.value = withTiming(COLLAPSED_OFFSET, { duration: ANIM_DURATION, easing: Easing.out(Easing.cubic) });
    backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: ANIM_DURATION });
  }, [visible]);

  // 关闭：从当前态下滑出屏幕 + 淡出，动画结束通知父级卸载
  const handleClose = () => {
    translateY.value = withTiming(HIDDEN_OFFSET, { duration: ANIM_DURATION }, () => {
      runOnJS(onClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: ANIM_DURATION });
  };

  // 展开：从收起态动画到展开态（仅拖拽上滑触发，无文字提示）
  const expand = () => {
    expandedRef.current = true;
    translateY.value = withTiming(EXPANDED_OFFSET, { duration: ANIM_DURATION, easing: Easing.out(Easing.cubic) });
  };

  // 回收：从展开态动画回收起态
  const collapse = () => {
    expandedRef.current = false;
    translateY.value = withTiming(COLLAPSED_OFFSET, { duration: ANIM_DURATION, easing: Easing.out(Easing.cubic) });
  };

  // 拖拽逻辑（以当前态的 base offset 为基准，向下为正）：
  // - 收起态（base=COLLAPSED_OFFSET）：向下拖拽 → 朝关闭方向；向上拖拽 → 朝展开方向。
  //   松手：向下超阈值/快速下甩 → 关闭；向上超阈值/快速上甩 → 展开；否则弹回收起态。
  // - 展开态（base=EXPANDED_OFFSET）：向下拖拽 → 朝回收方向；向上钳制在 0（不继续上移）。
  //   松手：向下超阈值/快速下甩 → 回收；否则弹回展开态。
  // 不设 activeOffsetY：该属性为正值时仅向下移动激活，会阻止向上滑展开。
  // 用默认 slop（约 10px）实现双向垂直拖拽激活。
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (expandedRef.current) {
        // 展开态：向下跟随（向上钳制在 0，不露出顶部空隙）
        const dy = Math.max(0, e.translationY);
        translateY.value = EXPANDED_OFFSET + dy;
        backdropOpacity.value = BACKDROP_OPACITY * (1 - Math.min(1, dy / EXPANDED_HEIGHT));
      } else {
        // 收起态：同时允许向下（关闭方向）和向上（展开方向）
        translateY.value = COLLAPSED_OFFSET + e.translationY;
        // 向下减少透明度（趋向关闭）；向上保持满透明度（趋向展开，不淡出）
        const fade = Math.max(0, Math.min(1, e.translationY / COLLAPSED_HEIGHT));
        backdropOpacity.value = BACKDROP_OPACITY * (1 - fade);
      }
    })
    .onEnd((e) => {
      if (expandedRef.current) {
        // 展开态：向下超阈值/快速下甩 → 回收
        if (e.translationY > DRAG_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
          runOnJS(collapse)();
          backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: SNAP_DURATION });
        } else {
          // 未达阈值：弹回展开态
          translateY.value = withTiming(EXPANDED_OFFSET, { duration: SNAP_DURATION });
        }
      } else {
        // 收起态：向下超阈值/快速下甩 → 关闭
        if (e.translationY > DRAG_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
          runOnJS(handleClose)();
        } else if (e.translationY < -DRAG_THRESHOLD || e.velocityY < -DISMISS_VELOCITY) {
          // 向上超阈值/快速上甩 → 展开
          runOnJS(expand)();
          backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: SNAP_DURATION });
        } else {
          // 未达阈值：弹回收起态
          translateY.value = withTiming(COLLAPSED_OFFSET, { duration: SNAP_DURATION });
          backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: SNAP_DURATION });
        }
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <GestureHandlerRootView style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />
        <Pressable style={styles.tapArea} onPress={handleClose} />
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: theme.background, height: EXPANDED_HEIGHT, paddingBottom: insets.bottom + Spacing.one },
              sheetStyle,
            ]}>
            {/* 抓手：点击关闭 */}
            <Pressable onPress={handleClose} hitSlop={Spacing.two} style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </Pressable>

            {/* ===== 收起态内容：头像 + 昵称 + 统计数据（始终渲染，位于卡片顶部） ===== */}
            <View style={styles.collapsedContent}>
              <View style={styles.avatarWrap}>
                <View style={styles.avatar} />
              </View>
              <ThemedText type="smallBold" style={styles.name}>我的</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">登录后查看个人信息</ThemedText>

              {/* 统计数据：照片数 / 路径数 */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <ThemedText type="smallBold" style={styles.statValue}>{photoCount}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">照片</ThemedText>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <ThemedText type="smallBold" style={styles.statValue}>{routeCount}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">路径</ThemedText>
                </View>
              </View>
            </View>

            {/* ===== 展开态内容：地图模式选择器（横向排列样图卡片，上图下名） ===== */}
            <View style={styles.expandedContent}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>地图模式</ThemedText>
              <View style={styles.mapOptionsRow}>
                {MAP_OPTIONS.map((opt) => {
                  const isSelected = mapType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => onMapTypeChange(opt.value)}
                      style={({ pressed }) => [styles.mapOption, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}>
                      {/* 样图：带模式底色 + 图标，选中项蓝色边框（iOS Maps 风格） */}
                      <View
                        style={[
                          styles.thumbnail,
                          { backgroundColor: opt.bgColor },
                          isSelected && styles.thumbnailSelected,
                        ]}>
                        <SymbolView
                          name={opt.symbol}
                          size={32}
                          tintColor="#ffffff"
                        />
                      </View>
                      <ThemedText
                        type="small"
                        style={[styles.mapOptionLabel, isSelected && styles.mapOptionLabelSelected]}>
                        {opt.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  tapArea: {
    ...StyleSheet.absoluteFill,
  },
  /** 卡片：高度固定为 EXPANDED_HEIGHT，bottom:0，通过 translateY 控制可见区域。
   *  translateY=HIDDEN_OFFSET → 完全隐藏；=COLLAPSED_OFFSET → 仅顶部 COLLAPSED_HEIGHT 可见；
   *  =EXPANDED_OFFSET → 完整面板可见。 */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  grabberWrap: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8A8A8E',
  },
  /** 收起态内容区：头像 + 昵称 + 统计 + 展开提示 */
  collapsedContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.one,
  },
  avatarWrap: {
    marginTop: Spacing.two,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E0E1E6',
  },
  name: {
    marginTop: Spacing.one,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.two,
    gap: Spacing.three,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#8A8A8E',
  },
  /** 展开态内容区：地图模式选择器 */
  expandedContent: {
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.three,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
  },
  /** 样图卡片横向排列（iOS Maps 风格） */
  mapOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  mapOption: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  /** 样图：方形，圆角，居中图标。选中态蓝色边框 */
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailSelected: {
    borderColor: SELECTED_BORDER_COLOR,
  },
  mapOptionLabel: {
    color: '#8A8A8E',
  },
  mapOptionLabelSelected: {
    color: SELECTED_BORDER_COLOR,
  },
  pressed: {
    opacity: 0.6,
  },
});
