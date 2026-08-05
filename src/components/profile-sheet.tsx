"use no memo";
/**
 * 「我的」个人中心底部卡片（native）——两段式（收起/展开）。
 *
 * 点击侧边按钮组「我的」按钮后，以 iOS 风格底部卡片从屏幕底部向上滑出。
 *
 * 两段式交互：
 * - 收起态（默认打开）：仅展示头像 + 昵称 + 统计数据（照片数/路径数/标点数）。
 *   向上拖拽 → 展开；点击「照片」/「路径」/「标点」统计项 → 直接展开到对应列表。
 * - 展开态：内容随 section 动态切换——
 *   'map'（拖拽上滑默认）：地图模式选择器（横向样图卡片，上图下名，选中项蓝边框）；
 *   'photos'：完整图库（原图库页迁入：设备相册照片/视频网格 + 查看器）；
 *   'routes'：路径管理（原右侧按钮组「路径」按钮功能迁移至此：导入 / 显隐 / 坐标模式 / 删除 / 点击定位）。
 *   'placemarks'：收藏标点列表（长按地图保存的坐标：点击定位 / 删除）。
 *   向下拖拽超过阈值 → 回到收起态；长拖（超过收起→关闭行程中点）或用力下甩 → 直接关闭面板。
 *
 * translateY 模型（卡片 bottom:0，高度动态=cardHeight，正值向下移动）：
 * - translateY=cardHeight：完全移出屏幕下方，不可见
 * - translateY=cardHeight-COLLAPSED_HEIGHT：下移使仅顶部 COLLAPSED_HEIGHT 可见（收起态）
 * - translateY=0：原位，完整卡片可见（照片/路径面板更高，LIST_HEIGHT）
 *
 * 收起态基准一律实时计算为 cardHeight - COLLAPSED_HEIGHT（不依赖缓存值），
 * 保证任何动画时序下收起态可见高度恒等于 COLLAPSED_HEIGHT。
 *
 * 样式与交互与 PhotoDetailSheet 同源：Modal 骨架/遮罩/抓手/拖拽关闭均复用
 * useBottomSheet + BottomSheetModal。组件常驻挂载，内部按 visible 提前 return。
 */

import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, cancelAnimation, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

import { PhotoLibrary } from '@/components/photo-album/photo-library';
import { LoginSheet } from '@/components/login-sheet';
import { RenameRouteSheet } from '@/components/rename-route-sheet';
import { liquidGlassAvailable } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { BottomSheetModal } from '@/components/ui/bottom-sheet-modal';
import { Spacing } from '@/constants/theme';
import {
  ANIM_DURATION,
  BACKDROP_OPACITY,
  DISMISS_THRESHOLD,
  DISMISS_VELOCITY,
  SNAP_DURATION,
  useBottomSheet,
} from '@/hooks/use-bottom-sheet';
import { useTheme } from '@/hooks/use-theme';
import { maskPhone, type User } from '@/hooks/use-auth';
import type { MapType } from '@/types/map';
import type { Placemark } from '@/types/placemark';
import type { Route } from '@/types/route';
import { formatLatLng } from '@/utils/geo';

/** 扩展态内容类型：地图模式选择（默认）/ 照片列表 / 路径列表 / 标点列表。 */
type ExpandedSection = 'map' | 'photos' | 'routes' | 'placemarks';

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

const screenHeight = Dimensions.get('window').height;

/** 收起态可见高度（仅展示头像+昵称+统计）。 */
const COLLAPSED_HEIGHT = 220;
/** 展开态回收的下甩速度阈值（px/s）：展开行程大（130~210px），阈值放宽避免轻甩误触回收；
 *  收起态关闭仍用 DISMISS_VELOCITY（500）。 */
const COLLAPSING_VELOCITY = 800;
/** 展开态直接关闭的下甩速度阈值（px/s）：必须比回收阈值更用力，
 *  中等甩动只回收，用力下甩才直接关闭整个面板。 */
const CLOSE_VELOCITY = 1000;
/** 地图模式展开态的卡片高度。 */
const MAP_HEIGHT = 480;
/** 照片/路径列表展开态的卡片高度（内容多，更高，上限 78% 屏高）。 */
const LIST_HEIGHT = Math.min(screenHeight * 0.78, 640);
/** 展开态的 translateY（原位，完整可见）。 */
const EXPANDED_OFFSET = 0;
/** 地图模式样图卡片尺寸。 */
const THUMBNAIL_SIZE = 96;
/** 选中态边框色（iOS 系统蓝）。 */
const SELECTED_BORDER_COLOR = '#007AFF';

export function ProfileSheet({
  visible,
  user,
  photoCount,
  routeCount,
  routes,
  placemarkCount,
  placemarks,
  mapType,
  onMapTypeChange,
  routeLoading,
  routeError,
  onImportRoute,
  onToggleRoute,
  onCycleCoordMode,
  onRemoveRoute,
  onRenameRoute,
  onSelectRoute,
  onDismissRouteError,
  onRemovePlacemark,
  onSelectPlacemark,
  onLogin,
  onLogout,
  onClose,
}: {
  visible: boolean;
  /** 当前登录用户；null = 未登录（收起态显示登录入口）。 */
  user: User | null;
  /** 设备相册照片+视频总数（统计项「照片」显示）。 */
  photoCount: number;
  routeCount: number;
  /** 已导入的路径列表，扩展态「路径」标签页展示。 */
  routes: Route[];
  /** 收藏标点总数（统计项「标点」显示）。 */
  placemarkCount: number;
  /** 收藏标点列表，扩展态「标点」标签页展示。 */
  placemarks: Placemark[];
  mapType: MapType;
  onMapTypeChange: (type: MapType) => void;
  /** 是否正在导入路径文件（显示加载指示）。 */
  routeLoading: boolean;
  /** 路径导入/解析错误信息。 */
  routeError: string | null;
  /** 触发文档选择器导入路径文件。 */
  onImportRoute: () => void;
  /** 切换某条路线显隐。 */
  onToggleRoute: (id: string) => void;
  /** 循环切换坐标模式（raw → toWgs84 → toGcj02），用于修正坐标系不匹配偏移。 */
  onCycleCoordMode: (id: string) => void;
  /** 删除某条路线。 */
  onRemoveRoute: (id: string) => void;
  /** 重命名某条路线（新名称由重命名弹层确认后回调）。 */
  onRenameRoute: (id: string, newName: string) => void;
  /** 点击路线名称：定位地图到该路线包围盒。 */
  onSelectRoute: (route: Route) => void;
  /** 关闭错误提示。 */
  onDismissRouteError: () => void;
  /** 删除某个收藏标点。 */
  onRemovePlacemark: (id: string) => void;
  /** 点击标点名称：定位地图到该坐标。 */
  onSelectPlacemark: (placemark: Placemark) => void;
  /** 登录成功回调（登录面板内完成校验，携带用户信息）。 */
  onLogin: (user: User) => void;
  /** 退出登录。 */
  onLogout: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  // iOS 26 Liquid Glass：图标不设 tintColor 走系统 luminance 适配；其他平台用主题色保证可见性
  const iconTint = liquidGlassAvailable ? undefined : theme.text;
  // 卡片当前是否展开。用共享值 mode 同步给手势 worklet 读取：
  // worklet 直接读 mode.value（UI 线程同步值，与动画同帧设置），杜绝 ref/闭包陈旧导致
  // 「视觉已收起、代码仍判展开」的状态不同步；同时用 state expanded 驱动手势重建
  // （activeOffsetY 随状态切换，见下方 pan）。
  // 0 = 收起态，1 = 展开态。
  const mode = useSharedValue(0);
  const [expanded, setExpanded] = useState(false);
  // 当前展开目标高度（expand() 记录，collapse() 收尾用）。与 cardHeight 动画目标保持一致。
  const targetHeightRef = useRef(MAP_HEIGHT);
  // 扩展态当前内容：默认地图模式；点击统计项切换为照片/路径列表。
  const [section, setSection] = useState<ExpandedSection>('map');
  // 卡片高度（动态）：地图模式 MAP_HEIGHT，照片/路径 LIST_HEIGHT，随 section 动画切换。
  const cardHeight = useSharedValue(MAP_HEIGHT);
  // 弹层动画共享值 + 打开/关闭：translateY 模型见文件头说明。
  // 注意：不再传 restingOffset/open()——收起位目标一律在 opening effect 中用纯 JS 常量
  // （MAP_HEIGHT - COLLAPSED_HEIGHT）计算，避免「写入 sharedValue 后同帧读回」的陈旧值问题。
  const { translateY, backdropOpacity, close } = useBottomSheet({
    onClose,
    height: cardHeight,
    initialHeight: MAP_HEIGHT,
  });

  // 照片查看器是否打开：打开期间禁用本面板的下滑关闭 Pan 与点击/返回关闭（
  // 查看器是 overFullScreen 透明 Modal，与面板 Modal 层叠时存在触摸穿透风险，
  // 下滑照片可能被面板 Pan 误判为「下滑关闭」）。由 PhotoLibrary 通过 onViewerOpenChange 通知。
  const [viewerOpen, setViewerOpen] = useState(false);
  // 登录面板是否打开：作为二级面板嵌套渲染在本 Modal 内（与照片查看器同理），
  // 避免两个顶层原生 Modal 同时 present 触发 UIKit "already presenting" 崩溃。
  // 打开登录时个人卡片滑出屏幕（见 openLogin），保证同一时刻仅一个面板可见。
  const [loginVisible, setLoginVisible] = useState(false);
  // 重命名弹层目标路径：非 null 时打开重命名面板（同样嵌套渲染在本 Modal 内）。
  const [renamingRoute, setRenamingRoute] = useState<Route | null>(null);

  // 查看器打开期间忽略一切关闭请求（tapArea 点击关闭经 onDismiss 走此函数）
  const guardedClose = useCallback(() => {
    if (viewerOpen) return;
    close();
  }, [viewerOpen, close]);

  // 打开登录面板：将个人卡片滑出屏幕并淡出遮罩（仅保留登录面板一个面板可见），
  // 再呈现登录面板。登录面板仍嵌套渲染在本 Modal 内（保持 "already presenting" 安全）。
  const openLogin = () => {
    mode.value = 0;
    setExpanded(false);
    setSection('map');
    targetHeightRef.current = MAP_HEIGHT;
    cancelAnimation(cardHeight);
    cancelAnimation(translateY);
    cancelAnimation(backdropOpacity);
    cardHeight.value = MAP_HEIGHT;
    translateY.value = withTiming(MAP_HEIGHT, { duration: ANIM_DURATION, easing: Easing.out(Easing.cubic) });
    backdropOpacity.value = withTiming(0, { duration: ANIM_DURATION });
    setLoginVisible(true);
  };

  // 登录面板关闭（登录成功或取消）后：恢复个人面板滑回收起态。
  const restoreProfile = () => {
    setLoginVisible(false);
    mode.value = 0;
    setExpanded(false);
    setSection('map');
    targetHeightRef.current = MAP_HEIGHT;
    cancelAnimation(cardHeight);
    cancelAnimation(translateY);
    cancelAnimation(backdropOpacity);
    cardHeight.value = MAP_HEIGHT;
    translateY.value = withTiming(MAP_HEIGHT - COLLAPSED_HEIGHT, {
      duration: ANIM_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: ANIM_DURATION });
  };

  // 记录上一次 visible，用于检测 false→true 的「打开」过渡。
  const prevVisibleRef = useRef(false);

  // 打开时（visible 由 false 变为 true）：重置自身状态后滑入收起态。
  useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!isOpening) return;
    // 二次打开防错配：上一会话（照片/路径面板的 LIST_HEIGHT 展开）遗留的
    // withTiming 动画可能仍在 UI 线程驱动 sharedValue——若未被取消，会在本次
    // 复位后把 cardHeight 拉回 640、translateY 停在旧收起位，导致收起态张开不完全。
    // 因此先 cancelAnimation 清掉所有残留动画，再显式复位到确定的隐藏位，最后
    // 滑入收起位。
    cancelAnimation(cardHeight);
    cancelAnimation(translateY);
    cancelAnimation(backdropOpacity);
    mode.value = 0;
    setExpanded(false);
    setSection('map'); // 每次打开默认展示地图模式
    setLoginVisible(false); // 关闭遗留的登录面板（防止下次打开直接弹出）
    targetHeightRef.current = MAP_HEIGHT;
    cardHeight.value = MAP_HEIGHT;
    translateY.value = MAP_HEIGHT; // 复位到隐藏位
    backdropOpacity.value = 0;
    // 收起位目标一律用纯 JS 常量（MAP_HEIGHT - COLLAPSED_HEIGHT）直接动画，
    // 不经过 sharedValue 读回——避免「同帧先写 collapsedOffset.value 再经 open()
    // 读 restingOffset.value」拿到陈旧值（照片/路径会话遗留的 LIST_HEIGHT 收起位 420），
    // 保证任何动画时序下二次打开收起态可见高度恒 = COLLAPSED_HEIGHT（220px）。
    translateY.value = withTiming(MAP_HEIGHT - COLLAPSED_HEIGHT, {
      duration: ANIM_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: ANIM_DURATION });
  }, [visible]);

  // 展开：从收起态动画到展开态。section 决定扩展态展示内容与卡片高度：
  // 拖拽上滑 → 'map'（地图模式，默认，MAP_HEIGHT）；点击统计项 → 'photos'/'routes'（LIST_HEIGHT，更高）。
  const expand = (sectionToShow: ExpandedSection = 'map') => {
    setSection(sectionToShow);
    const targetHeight = sectionToShow === 'map' ? MAP_HEIGHT : LIST_HEIGHT;
    targetHeightRef.current = targetHeight;
    mode.value = 1;
    setExpanded(true);
    cardHeight.value = withTiming(targetHeight, { duration: ANIM_DURATION });
    translateY.value = withTiming(EXPANDED_OFFSET, { duration: ANIM_DURATION, easing: Easing.out(Easing.cubic) });
  };

  // 回收：从展开态动画回收起态。收起态基准实时计算：
  // cardHeight 收尾到展开目标（取消未完成的高度动画），translateY 停靠到 目标 - COLLAPSED_HEIGHT，
  // 两者同速动画，任何时序下可见高度恒 = COLLAPSED_HEIGHT。
  const collapse = () => {
    mode.value = 0;
    setExpanded(false);
    const target = targetHeightRef.current;
    cardHeight.value = withTiming(target, { duration: ANIM_DURATION });
    translateY.value = withTiming(target - COLLAPSED_HEIGHT, { duration: ANIM_DURATION, easing: Easing.out(Easing.cubic) });
  };

  // 拖拽逻辑（以当前态的 base offset 为基准，向下为正）：
  // - 收起态（base=COLLAPSED_OFFSET）：向下拖拽 → 朝关闭方向；向上拖拽 → 朝展开方向。
  //   松手：向下超阈值/快速下甩 → 关闭；向上超阈值/快速上甩 → 展开；否则弹回收起态。
  // - 展开态（base=EXPANDED_OFFSET）：仅向下拖拽 → 朝回收方向；上滑不响应（交给内部列表滚动）。
  //   松手：向下超阈值/快速下甩 → 回收；否则弹回展开态。
  // activeOffsetY 按状态动态配置（随 expanded state 重建手势，GestureDetector 同步到原生）：
  // - 展开态 [ -100000, 10 ]：仅向下移动激活（上滑阈值设为实际不可能达到的 -100000px，
  //   替代 -Infinity：-Infinity 在 JS→原生配置传递中可能被序列化异常，导致手势配置错乱）。
  //   上滑由内部 ScrollView/FlatList 接管，Pan 不抢占，避免「展开态仍显示上滑交互」的干扰。
  // - 收起态 [ -10, 10 ]：双向激活（上滑展开 / 下滑关闭）。
  // 手势分支统一读共享值 mode（worklet 内同步、无陈旧，与动画同帧设置），
  // 手势重建由 expanded state 驱动，保证 activeOffsetY 与视觉状态严格一致。
  const pan = Gesture.Pan()
    .activeOffsetY(expanded ? [-100000, 10] : [-10, 10])
    // 查看器打开期间整体禁用：穿透触摸不会移动卡片，也不触发 onEnd 关闭/回收
    .enabled(!viewerOpen)
    .onUpdate((e) => {
      if (mode.value === 1) {
        // 展开态：向下跟随（向上钳制在 0，不露出顶部空隙）
        const dy = Math.max(0, e.translationY);
        translateY.value = EXPANDED_OFFSET + dy;
        backdropOpacity.value = BACKDROP_OPACITY * (1 - Math.min(1, dy / cardHeight.value));
      } else {
        // 收起态：同时允许向下（关闭方向）和向上（展开方向）。
        // 基准实时计算（cardHeight - COLLAPSED_HEIGHT），不依赖缓存值。
        translateY.value = cardHeight.value - COLLAPSED_HEIGHT + e.translationY;
        // 向下减少透明度（趋向关闭）；向上保持满透明度（趋向展开，不淡出）
        const fade = Math.max(0, Math.min(1, e.translationY / COLLAPSED_HEIGHT));
        backdropOpacity.value = BACKDROP_OPACITY * (1 - fade);
      }
    })
    .onEnd((e) => {
      if (mode.value === 1) {
        // 展开态：下拉决定 弹回/回收/直接关闭 三档——
        // - 超过「收起位→关闭位」行程中点，或用力下甩（CLOSE_VELOCITY）→ 直接关闭面板；
        // - 超过「展开位→收起位」行程中点，或中等下甩（COLLAPSING_VELOCITY）→ 回收起态；
        // - 否则弹回展开态。
        // 阈值按行程中点自适应（map 回收≈130px / 关闭≈370px，列表更高），
        // 不会「只拉一点就回收」；松手只决定 弹回/回收/关闭，关闭仅在长拖或用力下甩时发生。
        const collapsedY = cardHeight.value - COLLAPSED_HEIGHT;
        const snapDown = collapsedY / 2; // 展开→收起 行程中点
        const closeDown = (collapsedY + cardHeight.value) / 2; // 收起→关闭 行程中点
        if (e.translationY > closeDown || e.velocityY > CLOSE_VELOCITY) {
          // 直接关闭：close() 会同步收起遮罩并滑出屏幕
          runOnJS(close)();
        } else if (e.translationY > snapDown || e.velocityY > COLLAPSING_VELOCITY) {
          runOnJS(collapse)();
          backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: SNAP_DURATION });
        } else {
          // 未达阈值：弹回展开态
          translateY.value = withTiming(EXPANDED_OFFSET, { duration: SNAP_DURATION });
        }
      } else {
        // 收起态：向下超阈值/快速下甩 → 关闭
        if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
          runOnJS(close)();
        } else if (e.translationY < -DISMISS_THRESHOLD || e.velocityY < -DISMISS_VELOCITY) {
          // 向上超阈值/快速上甩 → 展开
          runOnJS(expand)();
          backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: SNAP_DURATION });
        } else {
          // 未达阈值：弹回收起态（基准实时计算）
          translateY.value = withTiming(cardHeight.value - COLLAPSED_HEIGHT, { duration: SNAP_DURATION });
          backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: SNAP_DURATION });
        }
      }
    });

  if (!visible) return null;

  return (
    <BottomSheetModal
      onDismiss={guardedClose}
      pan={pan}
      translateY={translateY}
      backdropOpacity={backdropOpacity}
      height={cardHeight}
      bottomPadding={0}>
      {/* ===== 收起态内容：头像 + 昵称 + 统计数据（始终渲染，位于卡片顶部） ===== */}
            <View style={styles.collapsedContent}>
              {/* 头像：未登录时点击打开登录面板（个人面板先滑出，仅保留登录面板） */}
              <Pressable
                onPress={user ? undefined : openLogin}
                disabled={!!user}
                style={({ pressed }) => [styles.avatarWrap, !user && pressed && styles.pressed]}
                accessibilityRole={user ? undefined : 'button'}
                accessibilityLabel={user ? undefined : '登录'}>
                <View style={styles.avatar}>
                  {user ? (
                    <ThemedText type="smallBold" style={styles.avatarLetter}>
                      {user.nickname.charAt(0)}
                    </ThemedText>
                  ) : (
                    <SymbolView
                      name={{ ios: 'person.fill', android: 'person', web: 'person' }}
                      size={30}
                      tintColor={theme.textSecondary}
                    />
                  )}
                </View>
              </Pressable>
              <ThemedText type="smallBold" style={styles.name}>
                {user ? user.nickname : '未登录'}
              </ThemedText>
              {/* 副标题：登录状态说明 + 退出入口 */}
              <View style={styles.subtitleRow}>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={1}
                  style={styles.subtitleText}>
                  {user
                    ? user.phone
                      ? maskPhone(user.phone)
                      : user.provider === 'wechat'
                        ? '微信快捷登录'
                        : 'QQ 快捷登录'
                    : '点击登录，开启轨迹与标点同步'}
                </ThemedText>
                {user && (
                  <Pressable onPress={onLogout} hitSlop={8} accessibilityLabel="退出登录">
                    <ThemedText type="small" themeColor="textSecondary">
                      退出
                    </ThemedText>
                  </Pressable>
                )}
              </View>

              {/* 统计数据：照片数 / 路径数。点击展开对应内容的扩展态。 */}
              <View style={styles.statsRow}>
                <Pressable
                  onPress={() => expand('photos')}
                  style={({ pressed }) => [styles.statItem, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${photoCount} 张照片`}>
                  <ThemedText type="smallBold" style={styles.statValue}>{photoCount}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">照片</ThemedText>
                </Pressable>
                <View style={styles.statDivider} />
                <Pressable
                  onPress={() => expand('routes')}
                  style={({ pressed }) => [styles.statItem, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${routeCount} 条路径`}>
                  <ThemedText type="smallBold" style={styles.statValue}>{routeCount}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">路径</ThemedText>
                </Pressable>
                <View style={styles.statDivider} />
                <Pressable
                  onPress={() => expand('placemarks')}
                  style={({ pressed }) => [styles.statItem, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${placemarkCount} 个标点`}>
                  <ThemedText type="smallBold" style={styles.statValue}>{placemarkCount}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">标点</ThemedText>
                </Pressable>
              </View>
            </View>

            {/* ===== 扩展态内容：随 section 动态切换 ===== */}
            {section === 'map' && (
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
            )}
            {section === 'photos' && (
              <View style={styles.expandedContent}>
                <ThemedText type="smallBold" style={styles.sectionTitle}>
                  照片（{photoCount}）
                </ThemedText>
                {/* 完整图库功能（原图库页迁入）：权限门控 + 网格 + 查看器 */}
                <PhotoLibrary onViewerOpenChange={setViewerOpen} />
              </View>
            )}
            {section === 'routes' && (
              <View style={styles.expandedContent}>
                {/* 标题行：标题左、导入按钮右（原右侧按钮组「路径」按钮的导入功能） */}
                <View style={styles.routesHeader}>
                  <ThemedText type="smallBold">
                    路径（{routeCount}）
                  </ThemedText>
                  <Pressable
                    onPress={onImportRoute}
                    disabled={routeLoading}
                    style={({ pressed }) => [styles.importBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="导入路径文件">
                    {routeLoading ? (
                      <ActivityIndicator size="small" color={theme.text} />
                    ) : (
                      <SymbolView
                        name={{ ios: 'folder.badge.plus', android: 'folder_open', web: 'folder_open' }}
                        size={24}
                        tintColor={iconTint}
                      />
                    )}
                  </Pressable>
                </View>

                {/* 错误条：红字 + 关闭 */}
                {routeError && (
                  <View style={styles.routeErrorBar}>
                    <ThemedText type="small" style={styles.routeErrorText} numberOfLines={2}>
                      {routeError}
                    </ThemedText>
                    <Pressable
                      onPress={onDismissRouteError}
                      hitSlop={Spacing.two}
                      style={({ pressed }) => [styles.routeErrorClose, pressed && styles.pressed]}>
                      <SymbolView
                        name={{ ios: 'xmark', android: 'close', web: 'close' }}
                        size={14}
                        tintColor={iconTint}
                      />
                    </Pressable>
                  </View>
                )}

                {routes.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                    暂无导入的路径，点击右上角按钮导入
                  </ThemedText>
                ) : (
                  <ScrollView style={styles.photoList} bounces={false}>
                    {routes.map((r) => (
                      <View key={r.id} style={styles.routeRow}>
                        {/* 路径颜色条，与地图 Polyline 同色 */}
                        <View style={[styles.routeColorDot, { backgroundColor: r.color }]} />
                        {/* 显隐切换 */}
                        <Pressable
                          onPress={() => onToggleRoute(r.id)}
                          hitSlop={Spacing.one}
                          style={({ pressed }) => [styles.routeActionBtn, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={r.visible ? '隐藏路径' : '显示路径'}>
                          <SymbolView
                            name={
                              r.visible
                                ? { ios: 'eye', android: 'visibility', web: 'visibility' }
                                : { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
                            }
                            size={20}
                            tintColor={iconTint}
                          />
                        </Pressable>
                        {/* 路线名称：点击定位 */}
                        <Pressable
                          onPress={() => onSelectRoute(r)}
                          style={({ pressed }) => [styles.routeNameBtn, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`定位到 ${r.name}`}>
                          <ThemedText
                            type="small"
                            numberOfLines={1}
                            style={[styles.routeName, !r.visible && styles.hiddenName]}>
                            {r.name}
                          </ThemedText>
                        </Pressable>
                        {/* 坐标模式三态循环：raw → toWgs84（GCJ-02 纠偏）→ toGcj02（WGS-84 加偏）→ raw。
                            国内轨迹文件与地图底图坐标系不匹配时，循环切换找到最佳对齐。 */}
                        <Pressable
                          onPress={() => onCycleCoordMode(r.id)}
                          hitSlop={Spacing.one}
                          style={({ pressed }) => [styles.routeActionBtn, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={
                            r.coordMode === 'raw'
                              ? '坐标模式：原始（点击切换为 GCJ-02 纠偏）'
                              : r.coordMode === 'toWgs84'
                                ? '坐标模式：GCJ-02 纠偏（点击切换为 WGS-84 加偏）'
                                : '坐标模式：WGS-84 加偏（点击恢复原始）'
                          }>
                          <SymbolView
                            name={{ ios: 'globe', android: 'public', web: 'public' }}
                            size={18}
                            tintColor={
                              r.coordMode === 'toWgs84'
                                ? r.color
                                : r.coordMode === 'toGcj02'
                                  ? '#34C759'
                                  : iconTint
                            }
                          />
                        </Pressable>
                        {/* 重命名 */}
                        <Pressable
                          onPress={() => setRenamingRoute(r)}
                          hitSlop={Spacing.one}
                          style={({ pressed }) => [styles.routeActionBtn, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`重命名 ${r.name}`}>
                          <SymbolView
                            name={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                            size={18}
                            tintColor={iconTint}
                          />
                        </Pressable>
                        {/* 删除 */}
                        <Pressable
                          onPress={() => onRemoveRoute(r.id)}
                          hitSlop={Spacing.one}
                          style={({ pressed }) => [styles.routeActionBtn, pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`删除 ${r.name}`}>
                          <SymbolView
                            name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                            size={18}
                            tintColor={iconTint}
                          />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
            {section === 'placemarks' && (
              <View style={styles.expandedContent}>
                {/* 标题行：标题左、提示右 */}
                <View style={styles.routesHeader}>
                  <ThemedText type="smallBold">
                    标点（{placemarkCount}）
                  </ThemedText>
                </View>

                {placemarks.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                    暂无收藏标点，长按地图任意位置即可保存
                  </ThemedText>
                ) : (
                  <ScrollView style={styles.photoList} bounces={false}>
                    {placemarks.map((p) => (
                      <View key={p.id} style={styles.placemarkRow}>
                        <View style={styles.placemarkNameRow}>
                          {/* 标点名称：点击定位 */}
                          <Pressable
                            onPress={() => onSelectPlacemark(p)}
                            style={({ pressed }) => [styles.routeNameBtn, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel={`定位到 ${p.name}`}>
                            <ThemedText type="small" numberOfLines={1}>{p.name}</ThemedText>
                          </Pressable>
                          {/* 删除 */}
                          <Pressable
                            onPress={() => onRemovePlacemark(p.id)}
                            hitSlop={Spacing.one}
                            style={({ pressed }) => [styles.routeActionBtn, pressed && styles.pressed]}
                            accessibilityRole="button"
                            accessibilityLabel={`删除 ${p.name}`}>
                            <SymbolView
                              name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                              size={16}
                              tintColor={iconTint}
                            />
                          </Pressable>
                        </View>
                        {/* 坐标小字 */}
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {formatLatLng(p.latitude, p.longitude).lat} / {formatLatLng(p.latitude, p.longitude).lng}
                        </ThemedText>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
      {/* 登录面板：作为本 Modal 的 children 嵌套渲染（与照片查看器同理）。
          RN Modal 组件渲染为独立原生窗口（全屏 present 到本 Modal 的 VC 上），
          不受上方卡片容器位置影响。若放在 Modal 外（Fragment 平级），会与个人
          面板同挂根 VC，触发 "already presenting" 崩溃。
          打开登录时个人卡片已滑出屏幕（openLogin），登录面板视觉上独占屏幕；
          成功/取消后由 restoreProfile 将个人面板滑回收起态，同一时刻仅一个面板。 */}
      <LoginSheet
        visible={loginVisible}
        onLogin={(u) => {
          onLogin(u);
          restoreProfile();
        }}
        onClose={restoreProfile}
      />
      {/* 重命名弹层：与登录面板同模式嵌套渲染 */}
      <RenameRouteSheet
        visible={renamingRoute !== null}
        currentName={renamingRoute?.name ?? ''}
        onConfirm={(name) => {
          if (renamingRoute) onRenameRoute(renamingRoute.id, name);
          setRenamingRoute(null);
        }}
        onClose={() => setRenamingRoute(null)}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 已登录：头像内显示昵称首字 */
  avatarLetter: {
    fontSize: 28,
    color: '#5A5A5E',
  },
  /** 副标题行：登录状态说明 + 退出入口 */
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  subtitleText: {
    flexShrink: 1,
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
  /** 展开态内容区：随 section 动态切换 */
  expandedContent: {
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.three,
    flex: 1,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
  },
  emptyText: {
    marginTop: Spacing.four,
    textAlign: 'center',
  },
  /** 路径面板标题行：标题左、导入按钮右 */
  routesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  importBtn: {
    padding: Spacing.two,
  },
  /** 错误条：红字 + 关闭按钮 */
  routeErrorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    marginBottom: Spacing.two,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderRadius: 8,
  },
  routeErrorText: {
    flex: 1,
    color: '#FF3B30',
  },
  routeErrorClose: {
    padding: Spacing.half,
  },
  /** 照片/路径列表：纵向滚动 */
  photoList: {
    flex: 1,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  routeColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  /** 行内操作小按钮（显隐 / 坐标模式 / 删除） */
  routeActionBtn: {
    padding: Spacing.half,
  },
  /** 路线名称可点区域：撑满剩余宽度 */
  routeNameBtn: {
    flex: 1,
  },
  /** 路线名称：字号放大至 16 便于阅读与点击 */
  routeName: {
    fontSize: 16,
    lineHeight: 22,
  },
  /** 隐藏路线名称降低对比度（但仍可读，标识其隐藏状态） */
  hiddenName: {
    opacity: 0.5,
  },
  /** 标点列表行：名称行 + 坐标小字两段式 */
  placemarkRow: {
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  placemarkNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
