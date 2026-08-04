"use no memo";
/**
 * 底部弹层（Bottom Sheet）共享逻辑：打开/关闭动画 + 纯关闭式拖拽手势工厂。
 *
 * 此前 ProfileSheet 与 PhotoDetailSheet 各自实现了一套相同的
 * Modal + 遮罩 + 抓手 + Pan 拖拽关闭机制（常量、动画、样式逐字重复），
 * 现统一收敛为 useBottomSheet（状态/动画）+ BottomSheetModal（骨架）两件套。
 *
 * 打开/关闭检测（visible 的 false→true / null→非 null 判定）因两个弹层的
 * 触发语义不同（PhotoDetailSheet 用 photo 字段、ProfileSheet 用 visible 布尔），
 * 交由调用方各自的 effect 处理：先做自身状态重置，再调用 open()。
 *
 * 本文件使用 "use no memo"：内含 sharedValue 写入 + Pan worklet 工厂，
 * React Compiler 会干扰 shared value 与 worklet 的同步（见项目记录）。
 */

import { useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

/** 滑动动画时长（ms）。 */
export const ANIM_DURATION = 300;
/** 回弹动画时长（ms）。 */
export const SNAP_DURATION = 200;
/** 遮罩目标透明度。 */
export const BACKDROP_OPACITY = 0.5;
/** 下滑距离超过此值触发关闭。 */
export const DISMISS_THRESHOLD = 80;
/** 下甩速度超过此值触发关闭。 */
export const DISMISS_VELOCITY = 500;

export type UseBottomSheetOptions = {
  /** 关闭动画结束后的最终回调（置空状态 / 卸载）。 */
  onClose: () => void;
  /** 卡片总高度（SharedValue，支持随内容动画变化）。 */
  height: SharedValue<number>;
  /** 首次挂载时卡片高度（translateY 初值 = 隐藏位）。 */
  initialHeight: number;
};

export type BottomSheetControls = {
  translateY: SharedValue<number>;
  backdropOpacity: SharedValue<number>;
  /** 打开：重置到隐藏位后滑入停靠位。调用方应在自身状态重置完成后调用。 */
  open: () => void;
  /** 关闭：下滑出屏 + 遮罩淡出，动画结束后回调 onClose。 */
  close: () => void;
};

export function useBottomSheet({
  onClose,
  height,
  initialHeight,
}: UseBottomSheetOptions): BottomSheetControls {
  const translateY = useSharedValue(initialHeight);
  const backdropOpacity = useSharedValue(0);

  const open = useCallback(() => {
    translateY.value = height.value;
    backdropOpacity.value = 0;
    translateY.value = withTiming(0, {
      duration: ANIM_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: ANIM_DURATION });
  }, [height, translateY, backdropOpacity]);

  const close = useCallback(() => {
    translateY.value = withTiming(height.value, { duration: ANIM_DURATION }, () => {
      runOnJS(onClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: ANIM_DURATION });
  }, [height, translateY, backdropOpacity, onClose]);

  return { translateY, backdropOpacity, open, close };
}

/**
 * 纯关闭式拖拽手势：仅支持下滑关闭（向上钳制在 0），松手超阈值或快速下甩则关闭。
 * 用于固定内容的弹层（如 PhotoDetailSheet）；需双向拖拽（上滑展开）的弹层
 * （如 ProfileSheet）应自行构建 Pan。
 */
export function createDismissPan({
  translateY,
  backdropOpacity,
  height,
  onClose,
}: {
  translateY: SharedValue<number>;
  backdropOpacity: SharedValue<number>;
  height: SharedValue<number>;
  onClose: () => void;
}) {
  return Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      const dy = Math.max(0, e.translationY);
      translateY.value = dy;
      backdropOpacity.value = BACKDROP_OPACITY * (1 - Math.min(1, dy / height.value));
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
        translateY.value = withTiming(height.value, { duration: ANIM_DURATION }, () => {
          runOnJS(onClose)();
        });
        backdropOpacity.value = withTiming(0, { duration: ANIM_DURATION });
      } else {
        translateY.value = withTiming(0, { duration: SNAP_DURATION });
        backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: SNAP_DURATION });
      }
    });
}
