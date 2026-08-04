/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;

/**
 * 液态玻璃统一 token：首页 4 个浮层 + web 底部栏共用。
 * overlay rgba 对齐 expo-blur web 端 getBackgroundColor 的 tint=light/dark 色系，
 * alpha 0.5 兼顾模糊透出与文字对比；BubbleTail 必须用同色以保证无缝。
 */
export const Glass = {
  intensity: 50,
  overlayLight: 'rgba(249, 249, 249, 0.5)',
  overlayDark: 'rgba(25, 25, 25, 0.5)',
} as const;

/**
 * 浮层阴影统一 token：首页地图各浮层（按钮 / 面板 / Marker）共用。
 * iOS 用 shadow* 系列，Android 用 elevation；三档对应不同体量元素。
 */
export const Shadow = {
  /** 小元素：照片 Marker 缩略图等。 */
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  /** 中体量：悬浮按钮 / 信息卡片。 */
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /** 面板浮层：搜索栏 / 结果卡 / 图层菜单。 */
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
} as const;
