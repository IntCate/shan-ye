/**
 * 全屏大图查看器（含 iOS 风格拖拽下滑返回缩略图动画）。
 *
 * 横向 pagingEnabled FlatList，每页宽度 = 屏幕宽，左右滑动切换。
 * 图片页：expo-image contain 显示，并绑定向下拖拽手势——拖拽时图片跟随手指、缩小、
 *   背景淡出；松手若超过阈值则动画飞回缩略图位置并关闭，否则弹簧回中心。
 * 视频页：expo-video VideoView + nativeControls（不绑拖拽，避免与原生控件冲突）。
 * 顶栏随背景淡出，显示返回按钮 + 计数。
 *
 * 模态用 transparent + overFullScreen，背景由动画黑色 View 控制，使下滑时底层的网格
 * 缩略图能透出，营造「图片飞回缩略图」的视觉。
 */

import { MediaType } from 'expo-media-library';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { PhotoItem, Rect } from '@/types/photo-album';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

/** 下滑距离超过此值（或快速下甩）即触发关闭。 */
const DISMISS_DISTANCE = 140;
/** 关闭动画时长。 */
const DISMISS_DURATION = 260;

type Props = {
  items: PhotoItem[];
  initialIndex: number;
  sourceRect: Rect;
  onClose: () => void;
};

export function PhotoViewer({ items, initialIndex, sourceRect, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const insets = useSafeAreaInsets();

  // 拖拽动画的共享值（图片页共享，背景与顶栏随 bgOpacity 淡出）
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const bgOpacity = useSharedValue(0); // 0 → mount 时淡入到 1

  // 打开时淡入背景
  useEffect(() => {
    bgOpacity.value = withTiming(1, { duration: 200 });
  }, [bgOpacity]);

  const onViewableItemsChanged = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setCurrentIndex(viewableItems[0].index);
  };
  const viewabilityConfig = { itemVisiblePercentThreshold: 50 };

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));

  return (
    <Modal visible animationType="none" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      {/* Modal 内容是独立原生窗口，需自带 GestureHandlerRootView */}
      <GestureHandlerRootView style={styles.root}>
        {/* 动画黑色背景 */}
        <Animated.View style={[styles.background, bgStyle]} pointerEvents="none" />

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: screenWidth,
            offset: screenWidth * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          scrollEventThrottle={16}
          renderItem={({ item, index }) => {
            // 只有当前页是可交互的 ViewerImage（带拖拽手势+动画）；
            // 邻页渲染为静态图片占位，不共享 transform——否则拖拽时 translateX 会让
            // 所有邻页一起平移、从屏幕两侧滑入视口，出现「上一张/下一张」。
            const isCurrent = index === currentIndex;
            if (item.mediaType === MediaType.VIDEO) {
              return <ViewerVideo item={item} active={isCurrent} />;
            }
            if (isCurrent) {
              return (
                <ViewerImage
                  item={item}
                  sourceRect={sourceRect}
                  translateX={translateX}
                  translateY={translateY}
                  scale={scale}
                  bgOpacity={bgOpacity}
                  onClose={onClose}
                />
              );
            }
            return <StaticImagePage item={item} />;
          }}
        />

        {/* 顶栏（随背景淡出） */}
        <Animated.View
          style={[styles.topBar, { paddingTop: insets.top + Spacing.four }, chromeStyle]}
          pointerEvents="box-none">
          <Pressable onPress={onClose} hitSlop={Spacing.two} style={styles.liquidBtn}>
            <SymbolView
              name={{ ios: 'chevron.backward', android: 'arrow_back', web: 'arrow_back' }}
              size={20}
              tintColor="#ffffff"
            />
          </Pressable>
          <ThemedText type="smallBold" style={styles.count}>
            {currentIndex + 1} / {items.length}
          </ThemedText>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** 图片页：expo-image contain + 向下拖拽关闭手势。 */
function ViewerImage({
  item,
  sourceRect,
  translateX,
  translateY,
  scale,
  bgOpacity,
  onClose,
}: {
  item: PhotoItem;
  sourceRect: Rect;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  bgOpacity: SharedValue<number>;
  onClose: () => void;
}) {
  // 取原始值供 worklet 闭包使用（避免捕获对象，Reanimated 只能序列化原始值）
  const sx = sourceRect.x;
  const sy = sourceRect.y;
  const sw = sourceRect.width;
  const sh = sourceRect.height;

  const pan = Gesture.Pan()
    .activeOffsetY(8) // 垂直移动 8px 激活
    .failOffsetX(8) // 水平移动 8px 失败，让位给横向翻页
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      const dist = Math.sqrt(e.translationX * e.translationX + e.translationY * e.translationY);
      scale.value = Math.max(0.3, 1 - dist / 700);
      bgOpacity.value = Math.max(0, 1 - dist / 400);
    })
    .onEnd((e) => {
      const dist = Math.sqrt(e.translationX * e.translationX + e.translationY * e.translationY);
      // 下滑超过阈值 或 快速下甩 → 关闭：飞回缩略图位置并淡出
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > 1000 || dist > DISMISS_DISTANCE) {
        const targetScale = sw / screenWidth;
        const targetX = sx + sw / 2 - screenWidth / 2;
        const targetY = sy + sh / 2 - screenHeight / 2;
        translateX.value = withTiming(targetX, { duration: DISMISS_DURATION });
        translateY.value = withTiming(targetY, { duration: DISMISS_DURATION });
        scale.value = withTiming(targetScale, { duration: DISMISS_DURATION });
        bgOpacity.value = withTiming(0, { duration: DISMISS_DURATION }, () => {
          runOnJS(onClose)();
        });
      } else {
        // 未达阈值：弹簧回中心
        translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
        scale.value = withSpring(1, { damping: 18, stiffness: 200 });
        bgOpacity.value = withTiming(1, { duration: 180 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.page, animStyle]}>
        <Image
          source={item.uri}
          style={styles.page}
          contentFit="contain"
          transition={200}
          cachePolicy="memory-disk"
        />
      </Animated.View>
    </GestureDetector>
  );
}

/** 非当前页的静态图片占位：仅用于横向翻页预渲染，不参与拖拽动画。 */
function StaticImagePage({ item }: { item: PhotoItem }) {
  return (
    <View style={styles.page}>
      <Image
        source={item.uri}
        style={styles.page}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
    </View>
  );
}

/** 查看器视频页：当前页播放，滑走暂停。不绑拖拽（与 nativeControls 冲突），用返回按钮关闭。 */
function ViewerVideo({ item, active }: { item: PhotoItem; active: boolean }) {
  const player = useVideoPlayer({ uri: item.uri }, (p) => {
    p.loop = true;
  });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <View style={styles.page}>
      <VideoView player={player} contentFit="contain" nativeControls style={styles.page} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  liquidBtn: {
    padding: Spacing.one,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(128, 128, 128, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    color: '#ffffff',
  },
  page: {
    width: screenWidth,
    height: screenHeight,
  },
});
