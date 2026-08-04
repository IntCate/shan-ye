"use no memo";
/**
 * 底部弹层骨架（Bottom Sheet）：Modal + 遮罩 + 点击层 + 抓手 + 拖拽手势容器。
 *
 * 与 useBottomSheet（动画/手势逻辑）配套使用，供 ProfileSheet 与 PhotoDetailSheet
 * 共用，消除两者此前重复的 Modal 结构、遮罩/卡片/抓手样式与拖拽容器。
 *
 * 组件常驻挂载（由父级始终渲染），内部按 visible 提前 return：visible 为 false 时不渲染 Modal。
 * 打开/关闭动画由 useBottomSheet 的 open()/close() 驱动，本组件仅消费其 sharedValue。
 */

import type { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { PanGesture } from 'react-native-gesture-handler';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type BottomSheetModalProps = PropsWithChildren<{
  /** 触发动画关闭（点击遮罩 / 抓手 / Android 返回键共用）。 */
  onDismiss: () => void;
  /** 拖拽手势（createDismissPan 或双向自定义 Pan）。 */
  pan: PanGesture;
  translateY: SharedValue<number>;
  backdropOpacity: SharedValue<number>;
  height: SharedValue<number>;
  /** 卡片底部内边距（安全区避让，卡片背景色随之延伸）。
   *  默认 insets.bottom + Spacing.one；需要内容占满到底的面板（如照片网格）可传 0。 */
  bottomPadding?: number;
}>;

export function BottomSheetModal({
  onDismiss,
  pan,
  translateY,
  backdropOpacity,
  height,
  bottomPadding,
  children,
}: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const sheetStyle = useAnimatedStyle(() => ({
    height: height.value,
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      {/* Modal 是独立原生窗口，需自带 GestureHandlerRootView 才能使用手势 */}
      <GestureHandlerRootView style={styles.overlay}>
        {/* 遮罩：淡入淡出，覆盖整屏（含 Tab 栏）。纯视觉，不拦截触摸。 */}
        <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />
        {/* 透明点击层：点击卡片以外区域关闭；卡片在其之上，点击卡片不会关闭 */}
        <Pressable style={styles.tapArea} onPress={onDismiss} />
        {/* 底部卡片（可拖拽） */}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background,
                paddingBottom: bottomPadding ?? insets.bottom + Spacing.one,
              },
              sheetStyle,
            ]}>
            {/* 抓手：点击关闭（扩大点击区域 + hitSlop） */}
            <Pressable onPress={onDismiss} hitSlop={Spacing.two} style={styles.grabberWrap}>
              <View style={styles.grabber} />
            </Pressable>
            {children}
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
  /** 卡片：bottom:0，高度由动画读取 height，translateY 控制可见区域。 */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
});
