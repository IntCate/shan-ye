/**
 * 图片查看器：预览模式（缩小图片 + 底部画廊）+ 全屏模式（占满 + 拖拽下滑关闭）。
 *
 * 预览模式（默认打开）：顶栏 + 图片预览区（contain 等比缩小）+ 底部画廊，三区垂直分开不重叠。
 *   单击图片 → 进入全屏模式；向下拖拽图片 → 缩小并淡出白色 chrome，松手超阈值下滑关闭。
 * 全屏模式：图片占满全屏，拖拽下滑飞回缩略图关闭（iOS Photos 风格三轴同步动画）。
 *   单击图片 → 回到预览模式。
 * 视频页：expo-video VideoView + nativeControls，不绑拖拽。
 *
 * 模态用 transparent + overFullScreen。全屏模式背景由动画黑色 View 控制，使下滑时底层的网格
 * 缩略图能透出，营造「图片飞回缩略图」的视觉。预览模式背景不透明。
 */

import { Image } from 'expo-image';
import { MediaType } from 'expo-media-library';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { PhotoItem, Rect } from '@/types/photo-album';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

/** 下滑距离超过此值（或快速下甩）即触发关闭。 */
const DISMISS_DISTANCE = 140;
/** 关闭动画时长。 */
const DISMISS_DURATION = 180;
/** 裁剪收紧时长：略快于 DISMISS_DURATION，让图片更早变成缩略图形状，
 *  视觉上"先快速收紧，再飞回"，比同步更利落自然。 */
const CLIP_DURATION = 120;

/** 底部画廊缩略图尺寸。 */
const THUMBNAIL_SIZE = 48;
/** 底部画廊缩略图间距（= marginRight，与 getItemLayout length 对齐）。 */
const THUMBNAIL_GAP = 8;

type Props = {
  items: PhotoItem[];
  initialIndex: number;
  sourceRect: Rect;
  onClose: () => void;
};

export function PhotoViewer({ items, initialIndex, sourceRect, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  // false = 预览模式（图片缩小 + 画廊分区）；true = 全屏模式（图片占满，拖拽下滑关闭）
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 图片区 FlatList 实际高度（预览/全屏模式不同），供每页填满
  const [listHeight, setListHeight] = useState(screenHeight);
  const insets = useSafeAreaInsets();

  // 拖拽动画的共享值（全屏模式图片页共享，背景与顶栏随 bgOpacity 淡出）
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const bgOpacity = useSharedValue(0);

  // 预览模式拖拽下滑关闭的共享值（独立于全屏模式，避免状态串扰）
  // previewChromeOpacity 控制白底+顶栏+画廊整体淡出；previewImgY/scale 控制图片跟随手指
  const previewImgY = useSharedValue(0);
  const previewImgScale = useSharedValue(1);
  const previewChromeOpacity = useSharedValue(1);

  // 进入全屏模式淡入背景；退出全屏重置共享值为下次进入准备
  useEffect(() => {
    if (isFullscreen) {
      bgOpacity.value = withTiming(1, { duration: 200 });
    } else {
      bgOpacity.value = 0;
      translateX.value = 0;
      translateY.value = 0;
      scale.value = 1;
    }
  }, [isFullscreen, bgOpacity, translateX, translateY, scale]);

  const pagingListRef = useRef<FlatList<PhotoItem>>(null);
  const galleryListRef = useRef<FlatList<PhotoItem>>(null);

  // 当前页变化时自动滚动画廊，让当前缩略图居中
  useEffect(() => {
    galleryListRef.current?.scrollToIndex({
      index: currentIndex,
      viewPosition: 0.5,
      animated: true,
    });
  }, [currentIndex]);

  // 点击缩略图 → 主列表翻到对应页
  const handleThumbnailPress = (index: number) => {
    pagingListRef.current?.scrollToIndex({ index, animated: true });
  };

  const onViewableItemsChanged = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setCurrentIndex(viewableItems[0].index);
  };
  const viewabilityConfig = { itemVisiblePercentThreshold: 50 };

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  // 预览模式：白底 + 顶栏 + 画廊整体透明度（拖拽时淡出透出底层网格缩略图）
  const previewChromeStyle = useAnimatedStyle(() => ({
    opacity: previewChromeOpacity.value,
  }));

  // 顶栏内容（预览/全屏模式复用）
  const topBarContent = (
    <>
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
    </>
  );

  return (
    <Modal visible animationType="none" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      {/* Modal 内容是独立原生窗口，需自带 GestureHandlerRootView */}
      <GestureHandlerRootView style={styles.root}>
        {/* 背景：预览模式白色（拖拽时随 chrome 淡出）；全屏模式黑色动画控制 */}
        {isFullscreen ? (
          <Animated.View style={[styles.background, bgStyle]} pointerEvents="none" />
        ) : (
          <Animated.View
            style={[styles.background, styles.backgroundPreview, previewChromeStyle]}
            pointerEvents="none"
          />
        )}

        {/* 预览模式顶栏（正常流式布局，占空间，图片区在下方；拖拽时随 chrome 淡出） */}
        {!isFullscreen && (
          <Animated.View
            style={[styles.topBarInline, { paddingTop: insets.top + Spacing.four }, previewChromeStyle]}
            pointerEvents="box-none">
            {topBarContent}
          </Animated.View>
        )}

        {/* 图片区 FlatList：预览模式 flex:1 在顶栏与画廊之间；全屏模式占满 */}
        <FlatList
          ref={pagingListRef}
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
          style={styles.imageList}
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
          renderItem={({ item, index }) => {
            const isCurrent = index === currentIndex;
            if (item.mediaType === MediaType.VIDEO) {
              return <ViewerVideo item={item} active={isCurrent} height={listHeight} />;
            }
            if (isFullscreen) {
              // 全屏模式：仅当前页可交互（拖拽关闭 + 单击回预览），邻页静态占位
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
                    onTap={() => setIsFullscreen(false)}
                  />
                );
              }
              return <StaticImagePage item={item} />;
            }
            // 预览模式：contain 等比缩小，单击进入全屏，拖拽下滑关闭
            return (
              <PreviewImage
                item={item}
                height={listHeight}
                translateY={previewImgY}
                scale={previewImgScale}
                chromeOpacity={previewChromeOpacity}
                onPress={() => setIsFullscreen(true)}
                onClose={onClose}
              />
            );
          }}
        />

        {/* 全屏模式顶栏（absolute 叠加，随背景淡出） */}
        {isFullscreen && (
          <Animated.View
            style={[styles.topBar, { paddingTop: insets.top + Spacing.four }, chromeStyle]}
            pointerEvents="box-none">
            {topBarContent}
          </Animated.View>
        )}

        {/* 底部画廊（仅预览模式，正常流式布局占空间；拖拽时随 chrome 淡出） */}
        {!isFullscreen && items.length > 1 && (
          <Animated.View
            style={[styles.gallery, { paddingBottom: insets.bottom + Spacing.two }, previewChromeStyle]}>
            <FlatList
              ref={galleryListRef}
              data={items}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              getItemLayout={(_, index) => ({
                length: THUMBNAIL_SIZE + THUMBNAIL_GAP,
                offset: (THUMBNAIL_SIZE + THUMBNAIL_GAP) * index,
                index,
              })}
              onScrollToIndexFailed={({ index }) => {
                galleryListRef.current?.scrollToOffset({
                  offset: (THUMBNAIL_SIZE + THUMBNAIL_GAP) * index,
                  animated: true,
                });
              }}
              contentContainerStyle={styles.galleryContent}
              renderItem={({ item, index }) => {
                const isCurrent = index === currentIndex;
                return (
                  <Pressable
                    onPress={() => handleThumbnailPress(index)}
                    style={styles.thumbnailPressable}>
                    <View style={[styles.thumbnail, isCurrent && styles.thumbnailActive]}>
                      {item.mediaType === MediaType.VIDEO ? (
                        <View style={styles.thumbnailVideo}>
                          <SymbolView
                            name={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                            size={16}
                            tintColor="#ffffff"
                          />
                        </View>
                      ) : (
                        <Image
                          source={item.uri}
                          style={styles.thumbnailImage}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      )}
                    </View>
                  </Pressable>
                );
              }}
            />
          </Animated.View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

/** 预览模式图片页：在区域内 contain 等比缩小显示。
 * 单击 → 进入全屏；向下拖拽 → 图片跟随手指缩小、白色 chrome 淡出，松手超阈值则下滑关闭。
 * 手势 Race(Tap, Pan)：Tap 进入全屏，Pan 下滑关闭。
 */
function PreviewImage({
  item,
  height,
  translateY,
  scale,
  chromeOpacity,
  onPress,
  onClose,
}: {
  item: PhotoItem;
  height: number;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  chromeOpacity: SharedValue<number>;
  onPress: () => void;
  onClose: () => void;
}) {
  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onPress)();
  });

  const pan = Gesture.Pan()
    .activeOffsetY(8) // 垂直移动 8px 激活（与全屏模式一致，让位横向翻页）
    .failOffsetX(8)
    .onUpdate((e) => {
      translateY.value = e.translationY;
      const dist = Math.abs(e.translationY);
      scale.value = Math.max(0.3, 1 - dist / 700);
      chromeOpacity.value = Math.max(0, 1 - dist / 400);
    })
    .onEnd((e) => {
      // 下滑超过阈值 或 快速下甩 → 关闭：图片继续下移出屏 + 缩小 + chrome 淡出
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > 1000) {
        translateY.value = withTiming(screenHeight, { duration: DISMISS_DURATION });
        scale.value = withTiming(0.3, { duration: DISMISS_DURATION });
        chromeOpacity.value = withTiming(0, { duration: DISMISS_DURATION }, () => {
          runOnJS(onClose)();
        });
      } else {
        // 未达阈值：弹簧回中心
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
        scale.value = withSpring(1, { damping: 18, stiffness: 200 });
        chromeOpacity.value = withTiming(1, { duration: 180 });
      }
    });

  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(tap, pan)}>
      <View style={[styles.page, { height }]}>
        <Animated.View style={[styles.previewImage, imgStyle]}>
          <Image
            source={item.uri}
            style={styles.previewImageFill}
            contentFit="contain"
            transition={200}
            cachePolicy="memory-disk"
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** 全屏图片页：双层容器实现 iOS Photos 风格关闭动画 + 单击回预览。
 *
 * 结构（从外到内）：
 *   page（整屏，居中，手势接收）
 *     └─ 裁剪容器（尺寸动画 + translate，overflow:hidden，居中布局）
 *          └─ 缩放容器（固定尺寸 renderW×renderH，scale 动画）
 *               └─ Image（1:1 填充缩放容器）
 *
 * 关闭动画三轴同步：
 *   1. translate：裁剪容器从屏幕中心 → 缩略图位置
 *   2. scale：图片从 1 → dismissScale（让图片缩放后刚好 cover 填充缩略图 sw×sh）
 *   3. 裁剪框尺寸：从 (renderW, renderH) → (sw, sh)，超出部分被 overflow:hidden 裁掉
 *
 * 手势：Race(Tap, Pan)——Tap 回到预览模式，Pan 拖拽下滑关闭。
 */
function ViewerImage({
  item,
  sourceRect,
  translateX,
  translateY,
  scale,
  bgOpacity,
  onClose,
  onTap,
}: {
  item: PhotoItem;
  sourceRect: Rect;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  bgOpacity: SharedValue<number>;
  onClose: () => void;
  onTap: () => void;
}) {
  // 取原始值供 worklet 闭包使用（避免捕获对象，Reanimated 只能序列化原始值）
  const sx = sourceRect.x;
  const sy = sourceRect.y;
  const sw = sourceRect.width;
  const sh = sourceRect.height;

  // contain 后图片在屏幕内的渲染尺寸：宽取 screenWidth，高按 aspect ratio 限制不超过 screenHeight。
  const iw = item.width || 1;
  const ih = item.height || 1;
  const aspect = iw / ih;
  let renderW = screenWidth;
  let renderH = screenWidth / aspect;
  if (renderH > screenHeight) {
    renderH = screenHeight;
    renderW = screenHeight * aspect;
  }

  // 裁剪框尺寸 SharedValue：初始 = 图片渲染尺寸，关闭动画时收紧到缩略图尺寸。
  // 收紧过程中图片超出部分被 overflow:'hidden' 裁掉，实现"逐渐裁剪成缩略图形状"。
  const clipW = useSharedValue(renderW);
  const clipH = useSharedValue(renderH);

  // 关闭目标 scale：让图片缩放后刚好 cover 填充缩略图 sw×sh。
  // max 保证短边填满（长边超出被裁），横图左右裁、竖图上下裁。
  const dismissScale = Math.max(sw / renderW, sh / renderH);

  // Tap：单击回到预览模式
  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onTap)();
  });

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
      // 下滑超过阈值 或 快速下甩 → 关闭：translate + scale + 裁剪框收紧 三轴同步
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > 1000 || dist > DISMISS_DISTANCE) {
        const targetX = sx + sw / 2 - screenWidth / 2;
        const targetY = sy + sh / 2 - screenHeight / 2;
        translateX.value = withTiming(targetX, { duration: DISMISS_DURATION });
        translateY.value = withTiming(targetY, { duration: DISMISS_DURATION });
        scale.value = withTiming(dismissScale, { duration: DISMISS_DURATION });
        clipW.value = withTiming(sw, { duration: CLIP_DURATION });
        clipH.value = withTiming(sh, { duration: CLIP_DURATION });
        bgOpacity.value = withTiming(0, { duration: DISMISS_DURATION }, () => {
          runOnJS(onClose)();
        });
      } else {
        // 未达阈值：弹簧回中心（裁剪框保持初始尺寸，无需复位）
        translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
        scale.value = withSpring(1, { damping: 18, stiffness: 200 });
        bgOpacity.value = withTiming(1, { duration: 180 });
      }
    });

  // 裁剪容器样式：尺寸动画 + translate（飞向缩略图位置）。
  // overflow:'hidden' 裁掉超出部分；justifyContent/alignItems:'center' 让内层缩放容器居中。
  const clipStyle = useAnimatedStyle(() => ({
    width: clipW.value,
    height: clipH.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // 缩放容器样式：固定尺寸，scale 相对自身中心。
  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(tap, pan)}>
      <View style={styles.page}>
        <Animated.View style={[styles.clip, clipStyle]}>
          <Animated.View style={[{ width: renderW, height: renderH }, imgStyle]}>
            <Image
              source={item.uri}
              style={{ width: renderW, height: renderH }}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          </Animated.View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** 非当前页的静态图片占位：仅用于全屏模式横向翻页预渲染，不参与拖拽动画。
 * 尺寸与 ViewerImage 一致（按 aspect ratio 居中），保证翻页时视觉连续。
 */
function StaticImagePage({ item }: { item: PhotoItem }) {
  const iw = item.width || 1;
  const ih = item.height || 1;
  const aspect = iw / ih;
  let renderW = screenWidth;
  let renderH = screenWidth / aspect;
  if (renderH > screenHeight) {
    renderH = screenHeight;
    renderW = screenHeight * aspect;
  }
  return (
    <View style={styles.page}>
      <View style={[styles.clip, { width: renderW, height: renderH }]}>
        <Image
          source={item.uri}
          style={{ width: renderW, height: renderH }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </View>
    </View>
  );
}

/** 查看器视频页：当前页播放，滑走暂停。不绑拖拽（与 nativeControls 冲突），用返回按钮关闭。 */
function ViewerVideo({
  item,
  active,
  height,
}: {
  item: PhotoItem;
  active: boolean;
  height: number;
}) {
  const player = useVideoPlayer({ uri: item.uri }, (p) => {
    p.loop = true;
  });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <View style={[styles.page, { height }]}>
      <VideoView
        player={player}
        contentFit="contain"
        nativeControls
        style={{ width: screenWidth, height }}
      />
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
  /** 预览模式背景：覆盖黑色为白色 */
  backgroundPreview: {
    backgroundColor: '#ffffff',
  },
  /** 预览模式顶栏：正常流式布局（占空间，图片区在下方） */
  topBarInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  /** 全屏模式顶栏：absolute 叠加在图片上，随背景淡出 */
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
  imageList: {
    flex: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** 预览模式图片外层动画容器：flex:1 填满预览区，承载拖拽 transform */
  previewImage: {
    flex: 1,
    width: screenWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** 预览模式图片本体：填满动画容器，contain 等比缩小 */
  previewImageFill: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  /** 裁剪容器：尺寸动画 + translate。
   *  overflow:'hidden' 裁掉超出部分；justifyContent/alignItems:'center' 让内层缩放容器始终居中，
   *  裁剪框收紧时图片上下/左右对称被裁。
   */
  clip: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** 预览模式底部画廊：正常流式布局（占空间，与图片区分开不重叠） */
  gallery: {
    paddingTop: Spacing.two,
  },
  galleryContent: {
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
  },
  thumbnailPressable: {
    marginRight: THUMBNAIL_GAP,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: Spacing.one,
    overflow: 'hidden',
    opacity: 0.5,
  },
  thumbnailActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  thumbnailImage: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
  },
  thumbnailVideo: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
