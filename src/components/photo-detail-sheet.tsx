/**
 * 照片详情底部卡片（native）。
 *
 * 点击地图上的照片图片 Marker 后，以 iOS 风格底部卡片从屏幕底部向上滑出。
 *
 * 关键设计：
 * - 使用 Modal 渲染，层级高于底部 Tab 栏，遮罩与卡片覆盖整屏（含安全区），
 *   解决此前「卡片浮在 Tab 栏上方、未完整覆盖底部」的问题。
 * - 卡片背景色延伸至屏幕底边（paddingBottom 含安全区在内），无透明缝隙。
 * - iOS 风格：顶部圆角 20 + grabber 抓手 + 照片大图 + 拍摄信息（时间、经纬度）。
 *
 * 交互：
 * - 上下拖拽：整张卡片绑定 Pan 手势，向下跟随手指（向上钳制在 0），松手超过阈值或快速下甩
 *   则关闭并下滑淡出，否则回弹。作用于整张卡片 →「任意位置下滑关闭」。
 * - 抓手（横杠）点击关闭。
 * - 点击卡片以外的遮罩区域或 Android 返回键关闭。
 *
 * 动画：Reanimated 共享值 translateY（卡片滑入/滑出/拖拽）+ backdropOpacity（遮罩淡入/淡出）。
 *
 * 组件常驻挂载（由父级始终渲染），内部按 photo 提前 return：photo 为 null 时不渲染 Modal。
 * 打开动画由 photo 的 null→非 null 过渡驱动（见下方 effect），关闭由 handleClose / 拖拽驱动。
 */

import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { GeoTaggedPhoto } from '@/types/geotagged-photo';

/** 卡片高度。 */
const SHEET_HEIGHT = 360;
/** 滑动动画时长（ms）。 */
const ANIM_DURATION = 300;
/** 回弹动画时长（ms）。 */
const SNAP_DURATION = 200;
/** 遮罩目标透明度。 */
const BACKDROP_OPACITY = 0.5;
/** 下滑距离超过此值触发关闭。 */
const DISMISS_THRESHOLD = 80;
/** 下甩速度超过此值触发关闭。 */
const DISMISS_VELOCITY = 500;

export function PhotoDetailSheet({
  photo,
  onClose,
}: {
  photo: GeoTaggedPhoto | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  // 卡片竖向位移：初始位于屏幕下方（卡片高度），打开时滑至 0
  const translateY = useSharedValue(SHEET_HEIGHT);
  // 遮罩透明度：初始 0，打开时淡入
  const backdropOpacity = useSharedValue(0);

  // 记录上一次 photo，用于检测 null→非 null 的「打开」过渡。
  // PhotoDetailSheet 常驻挂载（仅内部按 photo 提前 return），不能用 [] 依赖——
  // 那只在初始 photo=null 时跑一次，会导致首次打开无动画、关闭后再点无反应。
  const prevPhotoRef = useRef<GeoTaggedPhoto | null>(null);

  // 打开时（photo 由 null 变为非 null）：先把共享值重置到隐藏态，再动画进入。
  useEffect(() => {
    const isOpening = photo !== null && prevPhotoRef.current === null;
    prevPhotoRef.current = photo;
    if (!isOpening) return;
    translateY.value = SHEET_HEIGHT;
    backdropOpacity.value = 0;
    translateY.value = withTiming(0, { duration: ANIM_DURATION, easing: Easing.out(Easing.cubic) });
    backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: ANIM_DURATION });
  }, [photo]);

  // 关闭：下滑 + 淡出，动画结束卸载（点击遮罩 / 抓手 / 返回键共用）
  const handleClose = () => {
    translateY.value = withTiming(SHEET_HEIGHT, { duration: ANIM_DURATION }, () => {
      runOnJS(onClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: ANIM_DURATION });
  };

  // 上下拖拽：向下跟随手指（向上钳制在 0，不露出卡片上方空隙），松手超阈值或快速下甩则关闭，
  // 否则回弹。手势作用于整张卡片，故「在详情面板任意位置下滑即关闭」。
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      const dy = Math.max(0, e.translationY);
      translateY.value = dy;
      backdropOpacity.value = BACKDROP_OPACITY * (1 - Math.min(1, dy / SHEET_HEIGHT));
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
        translateY.value = withTiming(SHEET_HEIGHT, { duration: ANIM_DURATION }, () => {
          runOnJS(onClose)();
        });
        backdropOpacity.value = withTiming(0, { duration: ANIM_DURATION });
      } else {
        translateY.value = withTiming(0, { duration: SNAP_DURATION });
        backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: SNAP_DURATION });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!photo) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      {/* Modal 是独立原生窗口，需自带 GestureHandlerRootView 才能使用手势 */}
      <GestureHandlerRootView style={styles.overlay}>
        {/* 遮罩：淡入淡出，覆盖整屏（含 Tab 栏）。纯视觉，不拦截触摸。 */}
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />
        {/* 透明点击层：点击卡片以外区域关闭；卡片在其之上，点击卡片不会关闭 */}
        <Pressable style={styles.tapArea} onPress={handleClose} />
        {/* 底部详情卡片（可拖拽） */}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.one },
              sheetStyle,
            ]}>
            {/* 抓手：点击关闭（扩大点击区域 + hitSlop） */}
            <Pressable onPress={handleClose} hitSlop={Spacing.two} style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </Pressable>
            <Image source={{ uri: photo.uri }} style={styles.image} contentFit="cover" />
            <View style={styles.info}>
              <ThemedText type="smallBold">{new Date(photo.creationTime).toLocaleString()}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                纬度 {photo.latitude.toFixed(6)}°  经度 {photo.longitude.toFixed(6)}°
              </ThemedText>
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
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  /** 抓手点击区域（比视觉横杠更大，便于点中）。 */
  grabberWrap: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 30,
    alignItems: 'center',
  },
  /** iOS 风格抓手（横杠）。 */
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8A8A8E',
  },
  image: {
    marginTop: 8,
    marginHorizontal: 16,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#cccccc',
  },
  info: {
    marginTop: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
});
