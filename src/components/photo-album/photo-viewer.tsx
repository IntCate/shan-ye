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
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
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

/** 底部画廊外层槽容器边长（固定正方形，保证每项槽宽统一、居中/snap 计算不变）。 */
const THUMBNAIL_SIZE = 40;
/** 非当前项竖长方形宽高比（9:16，左右被白色竖线夹住）。 */
const THUMBNAIL_ASPECT = 9 / 16;
/** 非当前项左右白色竖线边框宽度。 */
const INACTIVE_BORDER_WIDTH = 1.5;
/** 底部画廊缩略图间距（所有相邻项统一间距）。 */
const THUMBNAIL_GAP = 6;
/** 画廊槽宽 = 缩略图边长 + 间距；任意项滚动到 offset = index × 槽宽 时严格居中。 */
const GALLERY_SLOT = THUMBNAIL_SIZE + THUMBNAIL_GAP;
/** 画廊当前项放大倍数（视觉放大；transform 不占位，槽宽/居中/snap 计算不变）。 */
const GALLERY_ACTIVE_SCALE = 1.2;
/** 画廊非当前项缩小倍数（距当前项 ≥1 槽即稳定为该值）。 */
const GALLERY_BASE_SCALE = 0.9;
/** 画廊滚动停止后「当前项放大」的过渡时长（平滑过渡，中间项带波峰扫过）。 */
const GALLERY_SCALE_DURATION = 200;
/** 全屏 → 预览「图片缩回」过渡时长：图片从占满平滑缩回预览 contain 位置。 */
const EXIT_FULLSCREEN_DURATION = 220;

type Props = {
  items: PhotoItem[];
  initialIndex: number;
  sourceRect: Rect;
  onClose: () => void;
  /**
   * iOS 18+ 真机系统限制（expo issue #31620）：AVPlayer 读取相册视频必报
   * Code=257（full 权限也不例外），缩略图/播放均失败。false 时视频页不创建
   * AVPlayer，显示静态占位；其余平台正常。
   */
  videoEnabled?: boolean;
};

export function PhotoViewer({ items, initialIndex, sourceRect, onClose, videoEnabled = true }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  // false = 预览模式（图片缩小 + 画廊分区）；true = 全屏模式（图片占满，拖拽下滑关闭）
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 图片区 FlatList 实际高度（预览/全屏模式不同），供每页填满
  const [listHeight, setListHeight] = useState(screenHeight);
  // 图片区顶部在屏幕中的 y（预览模式 onLayout 测得），供「飞回缩略图」动画的坐标换算
  const [imageAreaTop, setImageAreaTop] = useState(0);
  // 预览模式拖拽关闭进行中：期间隐藏非当前页，避免 FlatList 未对齐时左右露出相邻照片
  const [dragging, setDragging] = useState(false);
  // 画廊 FlatList 视口宽度（供居中计算：content 左右 padding = (视口宽 − 槽宽)/2）
  const [galleryWidth, setGalleryWidth] = useState(screenWidth);
  const insets = useSafeAreaInsets();

  // 拖拽动画的共享值（全屏模式图片页共享，背景与顶栏随 bgOpacity 淡出）
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const bgOpacity = useSharedValue(0);

  // 预览模式拖拽下滑关闭的共享值（独立于全屏模式，避免状态串扰）
  // previewChromeOpacity 控制白底+顶栏+画廊整体淡出；previewImgX/Y/scale 控制图片跟随手指，
  // 关闭时三轴同步飞回缩略图
  const previewImgX = useSharedValue(0);
  const previewImgY = useSharedValue(0);
  const previewImgScale = useSharedValue(1);
  const previewChromeOpacity = useSharedValue(1);
  // 画廊缩略图缩放的活跃索引（离散驱动，区别于 #45 初版的滚动偏移跟手缩放）：
  // 拖动/惯性滚动中不变（所有项统一尺寸、无缩放），滚动停止 / 程序跳转后
  // withTiming 平滑过渡到当前项 → 当前项放大、相邻项缩小
  const galleryActiveIndex = useSharedValue(initialIndex);

  // 反馈环防护：画廊滚动触发主列表同步时设为 true，useEffect 检测到则跳过画廊回滚
  const galleryInitiatedRef = useRef(false);
  // 程序滚动标记：useEffect 发起的画廊瞬时跳转期间设为 true，
  // onGalleryScroll 检测到则跳过主列表同步，避免程序跳转触发回环
  const programmaticScrollRef = useRef(false);
  // currentIndex 的 ref 镜像，供 onGalleryScroll 同步读取避免闭包陈旧值
  const currentIndexRef = useRef(initialIndex);

  // 更新画廊缩略图活跃索引（平滑过渡，中间项带波峰扫过）。
  // 滚动停止（onMomentumScrollEnd / 无惯性松手）与程序跳转（主图翻页 / 点击缩略图）时调用；
  // 拖动/惯性滚动中不调用——保持所有项统一尺寸、无缩放
  const syncActiveScaleIndex = useCallback((index: number) => {
    galleryActiveIndex.value = withTiming(index, { duration: GALLERY_SCALE_DURATION });
  }, []);

  // 缓存进入全屏前的预览布局（退出全屏缩回动画的目标计算依据：
  // 图片区顶部 y + 高度，动画把全屏图片缩回该区域中心）
  const previewLayoutRef = useRef({ top: 0, height: screenHeight });

  // 进入全屏：先瞬时置黑背景再切状态，避免渲染首帧 bgOpacity 仍为 0（上次退出归零）
  // 导致黑色背景透明 → 底层（个人面板/网格）透出「闪过」；黑色随图片占满一次性呈现。
  // 同时缓存当前预览布局（onLayout 已测得预览模式的 imageAreaTop / listHeight）
  const enterFullscreen = useCallback(() => {
    previewLayoutRef.current = { top: imageAreaTop, height: listHeight };
    bgOpacity.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    setIsFullscreen(true);
  }, [bgOpacity, translateX, translateY, scale, imageAreaTop, listHeight]);

  // 退出全屏：由 ViewerImage 先播放缩回动画（图片缩回预览位置 + 黑底淡出露白底），
  // 完成后才切状态，避免图片占满 → contain 突变「跳跃感」。切回后重置共享值备下次进入
  const exitFullscreen = useCallback(() => {
    // 先切回预览布局尺寸再切状态：避免切换首帧沿用全屏 listHeight/imageAreaTop
    // （screenHeight/0）渲染错误位置的图片，随后被 onLayout 修正造成「向下跳动」
    setListHeight(previewLayoutRef.current.height);
    setImageAreaTop(previewLayoutRef.current.top);
    setIsFullscreen(false);
  }, []);

  // 退出全屏重置共享值为下次进入准备（进入时已在 enterFullscreen 瞬时置黑）
  useEffect(() => {
    if (!isFullscreen) {
      bgOpacity.value = 0;
      translateX.value = 0;
      translateY.value = 0;
      scale.value = 1;
    }
  }, [isFullscreen, bgOpacity, translateX, translateY, scale]);

  const pagingListRef = useRef<FlatList<PhotoItem>>(null);
  const galleryListRef = useRef<FlatList<PhotoItem>>(null);

  // 主列表翻页 → 画廊居中当前缩略图。若翻页由画廊滚动触发（galleryInitiatedRef），跳过避免回环
  useEffect(() => {
    if (galleryInitiatedRef.current) {
      galleryInitiatedRef.current = false;
      return;
    }
    // 标记接下来的画廊 scrollToIndex 为程序滚动，onGalleryScroll 跳过同步避免回环
    programmaticScrollRef.current = true;
    galleryListRef.current?.scrollToIndex({
      index: currentIndex,
      viewPosition: 0, // content 左右 padding 已保证 offset = index × 槽宽 即居中
      animated: false, // 瞬时跳转（对齐 iOS Photos 联动，不做动画翻页）
    });
    // 主图翻页 / 点击缩略图（非画廊滚动来源）→ 画廊活跃索引同步到当前项，平滑放大
    syncActiveScaleIndex(currentIndex);
  }, [currentIndex]);

  // 点击缩略图 → 立即更新当前项（白框/计数），主图瞬时翻页（animated:false 无动画冲突），
  // 画廊居中由 useEffect 的程序滚动完成
  const handleThumbnailPress = (index: number) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
    pagingListRef.current?.scrollToIndex({ index, animated: false });
  };

  // 主列表翻页回调：更新 currentIndex（含 ref 镜像），触发上面的 useEffect 居中画廊。
  // 画廊发起的同步（galleryInitiatedRef）时跳过，避免主列表翻页中间状态的 viewableItems 回报
  // 触发额外的 setCurrentIndex → 画廊抖动
  const onViewableItemsChanged = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      // 画廊发起的同步已由 onGalleryScroll 更新 currentIndex，跳过避免回环
      if (galleryInitiatedRef.current) return;
      currentIndexRef.current = viewableItems[0].index;
      setCurrentIndex(viewableItems[0].index);
    }
  };

  // 用户开始拖动画廊 → 重置程序滚动标记，让 onGalleryScroll 恢复跨槽同步主图 + index 检测
  const onGalleryScrollBeginDrag = () => {
    programmaticScrollRef.current = false;
  };

  // 自然惯性停止后，把画廊吸附回最近整槽（当前项居中）。
  // 不用原生 snapToInterval：iOS 上它会在 scrollViewWillEndDragging 修正 targetContentOffset，
  // 接管减速曲线为「定长缓动」→ 甩动后冲过去骤停、无由快到慢（decelerationRate 失效）。
  // 改为「原生指数衰减惯性（由快到慢）+ 停止后一次短距平滑吸附（≤半槽）」，即 iOS Photos 机制。
  // 吸附动画是画廊列表自身的 setContentOffset:animated:——单次、距离≤半槽、非跨列表，
  // 无 #19「跨列表程序滚动动画反复打断 UIScrollView」的回环风险；用户新触摸会中断它
  const snapGalleryToSlot = useCallback((contentX: number) => {
    const target = Math.round(contentX / GALLERY_SLOT) * GALLERY_SLOT;
    // 首尾 content 左右 padding 使最大 offset = (项数−1)×槽宽，clamp 防越界弹回
    const maxOffset = Math.max(0, (items.length - 1) * GALLERY_SLOT);
    const clamped = Math.min(target, maxOffset);
    if (clamped !== contentX) {
      galleryListRef.current?.scrollToOffset({ offset: clamped, animated: true });
    }
  }, [items.length]);

  // 用户松手且无惯性（velocity 0）：已停止，直接吸附回整槽并放大当前项；有惯性交给 onMomentumScrollEnd
  const onGalleryScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // RN 0.86 types 对 NativeScrollEvent.velocity 的类型口径不一致，局部断言读取
    const velocity = (e.nativeEvent as { velocity?: { x?: number } }).velocity;
    if (!velocity?.x) {
      snapGalleryToSlot(e.nativeEvent.contentOffset.x);
      syncActiveScaleIndex(currentIndexRef.current);
    }
  };

  // 惯性减速结束（滚动完全停止）：吸附回最近整槽（当前项居中），并平滑放大当前项
  const onGalleryMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    snapGalleryToSlot(e.nativeEvent.contentOffset.x);
    syncActiveScaleIndex(currentIndexRef.current);
  };

  // 画廊滚动：跨槽即瞬时切主图页（iOS Photos 式 scrollToItem(animated:false)）。
  // JS 侧同步更新 currentIndex（计数/白框高亮）；程序滚动期间（useEffect 发起）跳过，避免反馈环。
  // 关键：全程不做 animated:true 的跨列表程序滚动——程序动画会反复打断 UIScrollView 本机滚动，
  // 触发全屏大图虚拟化渲染 + 加载风暴占满主线程，是此前快速滑动卡死的根因
  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (programmaticScrollRef.current) return; // 程序滚动，跳过同步
    if (galleryWidth === 0) return;

    const contentX = e.nativeEvent.contentOffset.x;
    // 居中索引：content 左右 padding = (视口宽 − 槽宽)/2，任意项居中时 offset 恰为 index × 槽宽
    const centeredIndex = Math.round(contentX / GALLERY_SLOT);

    if (
      centeredIndex >= 0 &&
      centeredIndex < items.length &&
      centeredIndex !== currentIndexRef.current
    ) {
      currentIndexRef.current = centeredIndex;
      galleryInitiatedRef.current = true;
      setCurrentIndex(centeredIndex);
      // 瞬时跳页：无动画、无中间页渲染，主图直接切到目标页（惯性经过多个槽时逐槽瞬切）
      pagingListRef.current?.scrollToIndex({ index: centeredIndex, animated: false });
    }
  };

  const viewabilityConfig = { itemVisiblePercentThreshold: 50 };

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  // 预览模式：白底 + 顶栏 + 画廊整体透明度（拖拽时淡出透出底层网格缩略图）
  const previewChromeStyle = useAnimatedStyle(() => ({
    opacity: previewChromeOpacity.value,
  }));

  // 顶栏内容（预览/全屏模式复用）：仅计数（返回按钮已移除，关闭走下滑拖拽）
  const topBarContent = (
    <ThemedText type="smallBold" style={styles.count}>
      {currentIndex + 1} / {items.length}
    </ThemedText>
  );

  return (
    <Modal visible animationType="none" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      {/* Modal 内容是独立原生窗口，需自带 GestureHandlerRootView */}
      <GestureHandlerRootView style={styles.root}>
        {/* 背景双层：白色预览背景常驻（预览模式不透明；全屏时被黑色盖住；退出全屏动画
            黑底淡出 → 露出白底，底层不会透出）；黑色全屏背景仅在 isFullscreen 叠加。
            必须拦截触摸（默认 auto，勿设 none/box-none）：查看器是 overFullScreen 透明 Modal，
            与下层个人面板 Modal 层叠，背景不拦截的区域 hitTest 失败会把触摸穿透到下层，
            触发个人面板的「下滑关闭」Pan，导致下滑照片时连带关闭个人面板 */}
        <Animated.View style={[styles.background, styles.backgroundPreview, previewChromeStyle]} />
        {isFullscreen && <Animated.View style={[styles.background, bgStyle]} />}

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
          // 隐藏横向滚动条（否则翻页时出现在主图下方/缩略图上方）
          showsHorizontalScrollIndicator={false}
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
          onLayout={(e) => {
            setListHeight(e.nativeEvent.layout.height);
            // 预览模式：图片区顶部 y = 顶栏高度（Modal 全屏，layout.y 即屏幕坐标），
            // 关闭动画用它把缩略图屏幕坐标换算为相对图片区中心的偏移
            setImageAreaTop(e.nativeEvent.layout.y);
          }}
          renderItem={({ item, index }) => {
            const isCurrent = index === currentIndex;
            if (item.mediaType === MediaType.VIDEO) {
              return (
                <ViewerVideo
                  item={item}
                  active={isCurrent}
                  height={listHeight}
                  enabled={videoEnabled}
                />
              );
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
                    // 缩回动画目标：进入全屏前缓存的预览布局（图片区 top + 高度）
                    previewTop={previewLayoutRef.current.top}
                    previewHeight={previewLayoutRef.current.height}
                    onExit={exitFullscreen}
                  />
                );
              }
              return <StaticImagePage item={item} />;
            }
            // 预览模式：拖拽关闭期间隐藏非当前页（邻页不渲染图片），
            // 避免 FlatList 翻页中途被拖拽抢占停在半页时，左右露出上一张/下一张照片
            if (dragging && !isCurrent) {
              return <View style={[styles.page, { height: listHeight }]} />;
            }
            // 预览模式：contain 等比缩小，单击进入全屏，拖拽下滑关闭
            return (
              <PreviewImage
                item={item}
                height={listHeight}
                sourceRect={sourceRect}
                imageAreaTop={imageAreaTop}
                translateX={previewImgX}
                translateY={previewImgY}
                scale={previewImgScale}
                chromeOpacity={previewChromeOpacity}
                onPress={enterFullscreen}
                onClose={onClose}
                onDragStart={() => setDragging(true)}
                onDragEnd={() => setDragging(false)}
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

        {/* 底部画廊（仅预览模式，正常流式布局占空间；拖拽时随 chrome 淡出）
            当前项无框正方形、非当前项 9:16 竖长方形左右白线夹住（无放大/让位效果）；
            content 左右 padding = (视口宽 − 槽宽)/2 使当前项始终居中，首尾留白随滑动推入 */}
        {!isFullscreen && items.length > 1 && (
          <Animated.View
            style={[styles.gallery, { paddingBottom: insets.bottom + Spacing.two }, previewChromeStyle]}>
            <FlatList
              ref={galleryListRef}
              data={items}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({
                length: GALLERY_SLOT,
                offset: GALLERY_SLOT * index,
                index,
              })}
              onScrollToIndexFailed={({ index }) => {
                galleryListRef.current?.scrollToOffset({
                  offset: GALLERY_SLOT * index,
                  animated: false,
                });
              }}
              onScroll={onGalleryScroll}
              onScrollBeginDrag={onGalleryScrollBeginDrag}
              onScrollEndDrag={onGalleryScrollEndDrag}
              onMomentumScrollEnd={onGalleryMomentumEnd}
              onLayout={(e) => setGalleryWidth(e.nativeEvent.layout.width)}
              scrollEventThrottle={16}
              // 不用原生 snapToInterval/snapToAlignment：iOS 上 snap 修正会接管减速曲线，
              // 甩动「冲过去骤停」。改为 decelerationRate 指数衰减（由快到慢）+
              // 惯性停止后 snapGalleryToSlot 短距平滑吸附回整槽
              decelerationRate={0.997}
              contentContainerStyle={[
                styles.galleryContent,
                // 左右留白 = (视口宽 − 槽宽)/2：首项居中、尾项居中，边缘留空随滑动推入
                { paddingHorizontal: (galleryWidth - GALLERY_SLOT) / 2 },
              ]}
              renderItem={({ item, index }) => (
                <GalleryThumbnail
                  item={item}
                  index={index}
                  activeIndex={galleryActiveIndex}
                  isCurrent={index === currentIndex}
                  onPress={() => handleThumbnailPress(index)}
                />
              )}
            />
          </Animated.View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * 画廊缩略图。
 *
 * 外层槽容器固定 THUMBNAIL_SIZE 正方形（每项槽宽统一，居中/snap 计算不变）；
 * 当前项：无框正方形；非当前项：9:16 竖长方形，左右两侧白色竖线夹住。
 * 离散缩放（iOS Photos 风格，区别于 #45 初版的滚动偏移跟手缩放）：按「与活跃索引的
 * 索引差」缩放——活跃项放大 1.2、相邻项缩 0.9。activeIndex 在滚动停止 / 程序跳转后
 * 以 withTiming 过渡（拖动/惯性滚动中不变 → 所有项统一尺寸，无缩放）。
 * 缩放用 transform（不占位），槽宽不变；滚动完全由 FlatList 原生驱动。
 */
function GalleryThumbnail({
  item,
  index,
  activeIndex,
  isCurrent,
  onPress,
}: {
  item: PhotoItem;
  index: number;
  /** 活跃索引（滚动停止 / 程序跳转后过渡到当前项），驱动离散缩放。 */
  activeIndex: SharedValue<number>;
  isCurrent: boolean;
  onPress: () => void;
}) {
  const scaleStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index - activeIndex.value);
    const scale = interpolate(
      dist,
      [0, 1],
      [GALLERY_ACTIVE_SCALE, GALLERY_BASE_SCALE],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }] };
  });

  return (
    <Pressable onPress={onPress} style={styles.thumbnailOuter}>
      <Animated.View style={[styles.thumbnailSlot, scaleStyle]}>
        <View
          style={[
            styles.thumbnail,
            // 当前项：无框正方形；非当前项：竖长方形 + 左右白线
            isCurrent ? { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE } : styles.thumbnailInactive,
          ]}>
          {item.mediaType === MediaType.VIDEO ? (
            <View style={styles.thumbnailVideo}>
              <SymbolView
                name={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
                size={12}
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
      </Animated.View>
    </Pressable>
  );
}

/** 预览模式图片页：在区域内 contain 等比缩小显示。
 * 单击 → 进入全屏；向下拖拽 → 图片跟随手指缩小、白色 chrome 淡出，松手超阈值
 * 则三轴同步飞回被点击的缩略图（iOS Photos 风格关闭动画），未达阈值则弹簧回中。
 * 手势 Race(Tap, Pan)：Tap 进入全屏，Pan 下滑关闭。
 */
function PreviewImage({
  item,
  height,
  sourceRect,
  imageAreaTop,
  translateX,
  translateY,
  scale,
  chromeOpacity,
  onPress,
  onClose,
  onDragStart,
  onDragEnd,
}: {
  item: PhotoItem;
  height: number;
  /** 被点击缩略图的屏幕坐标（关闭动画的飞回目标）。 */
  sourceRect: Rect;
  /** 图片区顶部在屏幕中的 y（onLayout 测得），把缩略图屏幕坐标换算为相对图片区的偏移。 */
  imageAreaTop: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  chromeOpacity: SharedValue<number>;
  onPress: () => void;
  onClose: () => void;
  /** 拖拽开始：隐藏非当前页，避免左右露出相邻照片。 */
  onDragStart: () => void;
  /** 拖拽结束（回弹）：恢复非当前页。 */
  onDragEnd: () => void;
}) {
  // 图片在图片区内的渲染尺寸（contain）：宽取屏宽，高按 aspect 限制不超过图片区高度
  const iw = item.width || 1;
  const ih = item.height || 1;
  const aspect = iw / ih;
  let renderW = screenWidth;
  let renderH = screenWidth / aspect;
  if (renderH > height) {
    renderH = height;
    renderW = height * aspect;
  }

  // 裁剪框尺寸：初始 = 图片渲染尺寸（不裁剪），关闭动画时收紧到缩略图 sw×sh（overflow hidden 裁边）
  const clipW = useSharedValue(renderW);
  const clipH = useSharedValue(renderH);

  // 关闭目标：图片缩放后恰好 cover 填充缩略图尺寸
  const dismissScale = Math.max(sourceRect.width / renderW, sourceRect.height / renderH);
  // 飞回目标 translate（相对图片区中心）= 缩略图中心 − 图片区中心
  const targetX = sourceRect.x + sourceRect.width / 2 - screenWidth / 2;
  const targetY = sourceRect.y + sourceRect.height / 2 - (imageAreaTop + height / 2);

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onPress)();
  });

  const pan = Gesture.Pan()
    .activeOffsetY(8) // 垂直移动 8px 激活（与全屏模式一致，让位横向翻页）
    .failOffsetX(8)
    .onBegin(() => {
      // 拖拽开始：隐藏非当前页（1 帧后生效），拖拽中左右不露出相邻照片
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      // 图片完全跟手（含轻微横向位移），随距离缩小、chrome 淡出
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      const dist = Math.abs(e.translationY);
      scale.value = Math.max(0.3, 1 - dist / 700);
      chromeOpacity.value = Math.max(0, 1 - dist / 400);
    })
    .onEnd((e) => {
      // 下滑超过阈值 或 快速下甩 → 关闭：三轴同步飞回缩略图（translate + scale + 裁剪框收紧）
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > 1000) {
        translateX.value = withTiming(targetX, { duration: DISMISS_DURATION });
        translateY.value = withTiming(targetY, { duration: DISMISS_DURATION });
        scale.value = withTiming(dismissScale, { duration: DISMISS_DURATION });
        clipW.value = withTiming(sourceRect.width, { duration: CLIP_DURATION });
        clipH.value = withTiming(sourceRect.height, { duration: CLIP_DURATION });
        chromeOpacity.value = withTiming(0, { duration: DISMISS_DURATION }, () => {
          runOnJS(onClose)();
        });
      } else {
        // 未达阈值：弹簧回中心（裁剪框保持初始尺寸），并结束拖拽态恢复邻页
        runOnJS(onDragEnd)();
        translateX.value = withSpring(0, { damping: 18, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
        scale.value = withSpring(1, { damping: 18, stiffness: 200 });
        chromeOpacity.value = withTiming(1, { duration: 180 });
      }
    });

  const clipStyle = useAnimatedStyle(() => ({
    width: clipW.value,
    height: clipH.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(tap, pan)}>
      <View style={[styles.page, { height }]}>
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
 * 手势：Race(Tap, Pan)——Tap 播放缩回动画回预览（图片缩回预览 contain 位置 + 黑底淡出露白底），
 * Pan 拖拽下滑关闭。
 */
function ViewerImage({
  item,
  sourceRect,
  translateX,
  translateY,
  scale,
  bgOpacity,
  onClose,
  previewTop,
  previewHeight,
  onExit,
}: {
  item: PhotoItem;
  sourceRect: Rect;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  bgOpacity: SharedValue<number>;
  onClose: () => void;
  /** 预览图片区顶部 y（进入全屏前缓存），退出缩回动画目标。 */
  previewTop: number;
  /** 预览图片区高度（进入全屏前缓存），退出缩回动画目标。 */
  previewHeight: number;
  /** 缩回动画完成后切回预览模式。 */
  onExit: () => void;
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

  // 退出全屏缩回目标：预览模式 contain 渲染尺寸（按预览图片区高度计算，与 PreviewImage 一致）。
  // 图片从全屏占满平滑缩回预览位置：scale 到预览/全屏尺寸比、translateY 到图片区中心偏移，
  // 裁剪框同步收紧到预览尺寸（overflow hidden 使中间帧始终填满，复用关闭动画机制）
  let pRenderW = screenWidth;
  let pRenderH = screenWidth / aspect;
  if (pRenderH > previewHeight) {
    pRenderH = previewHeight;
    pRenderW = previewHeight * aspect;
  }
  const exitScale = pRenderW / renderW;
  // 水平都居中 → 仅垂直偏移：预览图片区中心 − 屏幕中心
  const exitTranslateY = previewTop + previewHeight / 2 - screenHeight / 2;

  // Tap：播放缩回动画（图片缩回预览 contain 位置 + 黑底淡出露白底），完成后切回预览模式。
  // 动画终点与预览布局一致，状态切换无跳跃
  const tap = Gesture.Tap().onEnd(() => {
    translateX.value = withTiming(0, { duration: EXIT_FULLSCREEN_DURATION });
    translateY.value = withTiming(exitTranslateY, { duration: EXIT_FULLSCREEN_DURATION });
    scale.value = withTiming(exitScale, { duration: EXIT_FULLSCREEN_DURATION });
    clipW.value = withTiming(pRenderW, { duration: EXIT_FULLSCREEN_DURATION });
    clipH.value = withTiming(pRenderH, { duration: EXIT_FULLSCREEN_DURATION });
    bgOpacity.value = withTiming(0, { duration: EXIT_FULLSCREEN_DURATION }, () => {
      runOnJS(onExit)();
    });
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
  enabled,
}: {
  item: PhotoItem;
  active: boolean;
  height: number;
  /** iOS 18+ 真机上不创建 AVPlayer（系统限制必报 Code=257），显示静态占位。 */
  enabled?: boolean;
}) {
  const player = useVideoPlayer(enabled ? { uri: item.uri } : null, (p) => {
    p.loop = true;
  });
  useEffect(() => {
    if (!enabled) return;
    if (active) player.play();
    else player.pause();
  }, [active, enabled, player]);
  if (!enabled) {
    return (
      <View style={[styles.page, styles.videoDisabled, { height }]}>
        <ThemedText type="small" themeColor="textSecondary">
          视频预览暂不可用（iOS 18+ 系统限制）
        </ThemedText>
      </View>
    );
  }
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
  /** 预览模式顶栏：正常流式布局（占空间，图片区在下方），计数居中 */
  topBarInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  /** 全屏模式顶栏：absolute 叠加在图片上，随背景淡出，计数居中 */
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  imageList: {
    flex: 1,
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
  /** limited 权限下视频占位页：黑底 + 居中提示 */
  videoDisabled: {
    backgroundColor: '#000000',
    paddingHorizontal: Spacing.four,
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
    paddingTop: Spacing.three,
  },
  /** 水平 padding 由 (视口宽 − 槽宽)/2 内联传入（保证当前项严格居中）；paddingVertical 留出空间 */
  galleryContent: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  /** 缩略图外层：marginRight 保持相邻项间距 */
  thumbnailOuter: {
    marginRight: THUMBNAIL_GAP,
  },
  /** 槽容器：固定 THUMBNAIL_SIZE 正方形（槽宽统一），非当前项竖长方形在其中水平居中 */
  thumbnailSlot: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 缩略图本体：圆角 + 裁边 */
  thumbnail: {
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  /** 非当前项：9:16 竖长方形，左右两侧白色竖线夹住（上下无框）；当前项不套此样式 */
  thumbnailInactive: {
    width: Math.round(THUMBNAIL_SIZE * THUMBNAIL_ASPECT),
    height: THUMBNAIL_SIZE,
    borderLeftWidth: INACTIVE_BORDER_WIDTH,
    borderRightWidth: INACTIVE_BORDER_WIDTH,
    borderColor: '#ffffff',
  },
  thumbnailImage: {
    flex: 1,
  },
  thumbnailVideo: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
