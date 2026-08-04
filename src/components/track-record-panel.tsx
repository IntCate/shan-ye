/**
 * 路径绘制（轨迹录制）底部面板：统计总里程 / 耗时 / 当前海拔 + 三枚圆形操作按钮。
 *
 * 样式与个人面板（ProfileSheet）一致：复用 BottomSheetModal 底部弹层骨架
 * （Modal + 遮罩 + 抓手 + 下滑关闭），背景为不透明主题色、顶部圆角。
 * 按钮布局为三按钮横排（圆形）：左=暂停↔继续、中=主按钮、右=结束。
 * 中央主按钮：idle 时为「开始」（play），点击开始录制后变为「拍照」（camera），
 * 拍摄由首页注入的 onCapture 实现（系统相机 → 保存相册 → 相册监听增量显示地图标记）。
 * 状态机（由 useTrackRecorder 驱动）：idle（仅「开始」可用）→ recording（左显示「暂停」、
 * 中显示「拍照」）→ paused（左显示「继续」）→ 结束保存轨迹为路线。
 * 关闭面板不停止录制：hook 由首页持有，定位订阅继续，重新打开面板可查看进度。
 */

import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { BottomSheetModal } from '@/components/ui/bottom-sheet-modal';
import { Spacing } from '@/constants/theme';
import { createDismissPan, useBottomSheet } from '@/hooks/use-bottom-sheet';
import { useTheme } from '@/hooks/use-theme';
import type { TrackStatus } from '@/hooks/use-track-recorder';

const COLOR_BLUE = '#0A84FF';
const COLOR_GREEN = '#34C759';
const COLOR_RED = '#FF3B30';
const COLOR_GRAY = '#8E8E93';

/** 面板内容固定高度（标题 + 统计 + 状态 + 圆形按钮组 + 抓手）。 */
const TRACK_PANEL_HEIGHT = 272;

type TrackRecordPanelProps = {
  visible: boolean;
  status: TrackStatus;
  /** 已记录轨迹点数（结束可用性判断：>=2 才允许保存为路线）。 */
  pointCount: number;
  /** 总里程（米）。 */
  distanceM: number;
  /** 耗时（毫秒）。 */
  elapsedMs: number;
  /** 当前海拔（米）。 */
  altitudeM: number | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  /** 结束录制并保存为路线。 */
  onStop: () => void;
  /** 中央主按钮由「开始」变为「拍照」后的拍摄回调（录制中可用）。 */
  onCapture: () => void;
  onClose: () => void;
};

export function TrackRecordPanel({
  visible,
  status,
  pointCount,
  distanceM,
  elapsedMs,
  altitudeM,
  onStart,
  onPause,
  onResume,
  onStop,
  onCapture,
  onClose,
}: TrackRecordPanelProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const height = useSharedValue(TRACK_PANEL_HEIGHT);
  const { translateY, backdropOpacity, open, close } = useBottomSheet({
    onClose,
    height,
    initialHeight: TRACK_PANEL_HEIGHT,
  });
  // 纯关闭式拖拽：下滑超阈值/快速下甩关闭（与 PhotoDetailSheet 相同）
  const pan = useMemo(
    () => createDismissPan({ translateY, backdropOpacity, height, onClose }),
    [translateY, backdropOpacity, height, onClose]
  );

  // visible false→true 时打开：滑入 + 遮罩淡入
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!isOpening) return;
    open();
  }, [visible, open]);

  if (!visible) return null;

  const recording = status === 'recording';
  const paused = status === 'paused';
  const idle = status === 'idle';
  // 「开始」仅 idle 可用（启动一次）；「暂停/继续」在 recording/paused 间来回切换
  // 「暂停/继续」：idle 时禁用，recording 显示「暂停」、paused 显示「继续」
  const toggleDisabled = idle;
  // 结束可用：录制中或已暂停，且至少 2 个轨迹点（1 点不成轨迹）
  const canStop = (recording || paused) && pointCount >= 2;

  const statusText = idle
    ? '点击「开始」开始记录轨迹'
    : recording
      ? '正在记录轨迹…'
      : '已暂停，点击「继续」恢复记录';

  const formatKm = (m: number) => (m / 1000).toFixed(2);
  const formatHours = (ms: number) => (ms / 3_600_000).toFixed(2);
  const altitudeText = altitudeM != null ? String(Math.round(altitudeM)) : '--';

  return (
    <BottomSheetModal
      onDismiss={close}
      pan={pan}
      translateY={translateY}
      backdropOpacity={backdropOpacity}
      height={height}
      bottomPadding={insets.bottom + Spacing.two}>
      <View style={styles.content}>
        {/* 标题行 */}
        <View style={styles.header}>
          <ThemedText type="smallBold">路径绘制</ThemedText>
          <Pressable onPress={close} hitSlop={8} accessibilityLabel="关闭">
            <SymbolView name="xmark" size={16} tintColor={theme.textSecondary} />
          </Pressable>
        </View>

        {/* 统计：总里程（公里）/ 耗时（小时）/ 当前海拔（米） */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <ThemedText type="smallBold" style={styles.statValue}>{formatKm(distanceM)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">总里程（公里）</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText type="smallBold" style={styles.statValue}>{formatHours(elapsedMs)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">耗时（小时）</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <ThemedText type="smallBold" style={styles.statValue}>{altitudeText}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">当前海拔（米）</ThemedText>
          </View>
        </View>

        {/* 状态提示 */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.statusText}>
          {statusText}
        </ThemedText>

        {/* 按钮组（三枚圆形，横排居中）：左=暂停↔继续，中=主按钮（开始→拍照），右=结束 */}
        <View style={styles.actions}>
          <Pressable
            onPress={recording ? onPause : onResume}
            disabled={toggleDisabled}
            hitSlop={4}
            style={[
              styles.actionBtn,
              { backgroundColor: paused ? COLOR_GREEN : COLOR_GRAY },
              toggleDisabled && styles.disabled,
            ]}
            accessibilityLabel={paused ? '继续' : '暂停'}>
            <SymbolView name={paused ? 'play.fill' : 'pause.fill'} size={22} tintColor="#ffffff" />
          </Pressable>
          {idle ? (
            <Pressable
              onPress={onStart}
              hitSlop={4}
              style={[styles.mainBtn, { backgroundColor: COLOR_BLUE }]}
              accessibilityLabel="开始">
              <SymbolView name="play.fill" size={26} tintColor="#ffffff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={onCapture}
              hitSlop={4}
              style={[styles.mainBtn, { backgroundColor: COLOR_BLUE }]}
              accessibilityLabel="拍照">
              <SymbolView name="camera.fill" size={26} tintColor="#ffffff" />
            </Pressable>
          )}
          <Pressable
            onPress={onStop}
            disabled={!canStop}
            hitSlop={4}
            style={[styles.actionBtn, { backgroundColor: COLOR_RED }, !canStop && styles.disabled]}
            accessibilityLabel="结束">
            <SymbolView name="stop.fill" size={22} tintColor="#ffffff" />
          </Pressable>
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  statValue: {
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(127, 127, 127, 0.4)',
    marginVertical: Spacing.one,
  },
  statusText: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: Spacing.one,
  },
  /** 左右圆形按钮（60pt 直径）。 */
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 中央主按钮（68pt 直径，略大突出）。 */
  mainBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
});
