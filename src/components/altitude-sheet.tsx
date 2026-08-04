/**
 * 海拔高度底部面板：实时显示当前海拔（米），带迷你海拔折线与最低/最高值。
 *
 * 样式与路径绘制面板（TrackRecordPanel）一致：复用 BottomSheetModal 底部弹层骨架
 * （Modal + 遮罩 + 抓手 + 下滑关闭），背景为不透明主题色、顶部圆角。
 * 面板打开（visible true）时由 useAltitude 开始 GPS 高频订阅，关闭时停止；
 * 大数字实时刷新，下方 SVG 折线绘制最近 60 秒海拔变化，状态行区分
 * 定位中 / 权限拒绝 / 定位异常 / 实时监测 四种情况。
 */

import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import Svg, { Defs, LinearGradient, Polygon, Polyline, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { BottomSheetModal } from '@/components/ui/bottom-sheet-modal';
import { Spacing } from '@/constants/theme';
import { useAltitude } from '@/hooks/use-altitude';
import { createDismissPan, useBottomSheet } from '@/hooks/use-bottom-sheet';
import { useTheme } from '@/hooks/use-theme';

/** 面板内容固定高度（标题 + 大数字 + 迷你折线 + 状态行 + 抓手）。 */
const ALTITUDE_SHEET_HEIGHT = 292;
/** 迷你折线尺寸。 */
const SPARK_WIDTH = 220;
const SPARK_HEIGHT = 52;
/** 折线主题色（iOS 系统蓝）。 */
const ACCENT_COLOR = '#0A84FF';

type AltitudeSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function AltitudeSheet({ visible, onClose }: AltitudeSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const height = useSharedValue(ALTITUDE_SHEET_HEIGHT);
  const { translateY, backdropOpacity, open, close } = useBottomSheet({
    onClose,
    height,
    initialHeight: ALTITUDE_SHEET_HEIGHT,
  });
  // 纯关闭式拖拽：下滑超阈值/快速下甩关闭（与 TrackRecordPanel 相同）
  const pan = useMemo(
    () => createDismissPan({ translateY, backdropOpacity, height, onClose }),
    [translateY, backdropOpacity, height, onClose]
  );

  // 海拔监测：面板打开即开始订阅，关闭即停止（组件常驻挂载）
  const { status, altitudeM, samples, start, stop } = useAltitude();

  // visible false→true 时打开：滑入 + 遮罩淡入，并开始海拔监测
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!isOpening) return;
    start();
    open();
  }, [visible, open, start]);

  // 关闭时停止监测
  useEffect(() => {
    if (!visible) stop();
  }, [visible, stop]);

  if (!visible) return null;

  const locating = status === 'locating';
  const denied = status === 'denied';
  const error = status === 'error';
  const altitudeText = altitudeM != null ? String(Math.round(altitudeM)) : '--';
  const minM = samples.length > 0 ? Math.round(Math.min(...samples)) : null;
  const maxM = samples.length > 0 ? Math.round(Math.max(...samples)) : null;

  // 迷你折线：把样本线性映射到画布；区间为 0 时（所有值相等）画在中线
  const sparkPoints = useMemo(() => {
    if (samples.length < 2) return '';
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const range = max - min || 1;
    const step = SPARK_WIDTH / (samples.length - 1);
    return samples
      .map(
        (v, i) =>
          `${(i * step).toFixed(1)},${(SPARK_HEIGHT - ((v - min) / range) * (SPARK_HEIGHT - 4) - 2).toFixed(1)}`
      )
      .join(' ');
  }, [samples]);
  const sparkArea = sparkPoints ? `0,${SPARK_HEIGHT} ${sparkPoints} ${SPARK_WIDTH},${SPARK_HEIGHT}` : '';

  const statusLine = locating ? (
    <>
      <ActivityIndicator size="small" color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        正在获取海拔…
      </ThemedText>
    </>
  ) : denied ? (
    <ThemedText type="small" themeColor="textSecondary">
      未获得定位权限，请在系统设置中允许山也访问位置
    </ThemedText>
  ) : error ? (
    <ThemedText type="small" themeColor="textSecondary">
      获取海拔失败，请关闭后重试
    </ThemedText>
  ) : (
    <>
      {/* 实时监测指示点：绿点 + 文字 */}
      <View style={styles.liveDot} />
      <ThemedText type="small" themeColor="textSecondary">
        实时海拔 · 每秒更新
      </ThemedText>
    </>
  );

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
          <View style={styles.headerTitle}>
            <SymbolView
              name={{ ios: 'mountain.2.fill', android: 'terrain', web: 'terrain' }}
              size={18}
              tintColor={ACCENT_COLOR}
            />
            <ThemedText type="smallBold">海拔高度</ThemedText>
          </View>
          <Pressable onPress={close} hitSlop={8} accessibilityLabel="关闭">
            <SymbolView name="xmark" size={16} tintColor={theme.textSecondary} />
          </Pressable>
        </View>

        {/* 中央大数字：当前海拔（米） */}
        <View style={styles.altitudeWrap}>
          <ThemedText style={styles.altitudeValue}>{altitudeText}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            米
          </ThemedText>
        </View>

        {/* 迷你海拔折线（最近 60 秒样本）：渐变填充 + 渐变描边 */}
        <View style={styles.sparkWrap}>
          {sparkArea ? (
            <Svg width={SPARK_WIDTH} height={SPARK_HEIGHT}>
              <Defs>
                <LinearGradient id="altArea" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={ACCENT_COLOR} stopOpacity="0.32" />
                  <Stop offset="1" stopColor={ACCENT_COLOR} stopOpacity="0.02" />
                </LinearGradient>
                <LinearGradient id="altLine" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={ACCENT_COLOR} stopOpacity="0.4" />
                  <Stop offset="1" stopColor={ACCENT_COLOR} stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Polygon points={sparkArea} fill="url(#altArea)" />
              <Polyline
                points={sparkPoints}
                fill="none"
                stroke="url(#altLine)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </Svg>
          ) : (
            <View style={[styles.sparkPlaceholder, { backgroundColor: 'rgba(127,127,127,0.15)' }]} />
          )}
        </View>

        {/* 最低 / 最高海拔（会话内） */}
        <View style={styles.rangeRow}>
          <ThemedText type="small" themeColor="textSecondary">
            最低 {minM ?? '--'} 米
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            最高 {maxM ?? '--'} 米
          </ThemedText>
        </View>

        {/* 状态行 */}
        <View style={styles.statusRow}>{statusLine}</View>
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
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  /** 大数字区：数字 + 单位 垂直居中 */
  altitudeWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  altitudeValue: {
    fontSize: 68,
    lineHeight: 82,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  /** 迷你折线容器：占位固定高度，居中 */
  sparkWrap: {
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  /** 折线尚未有数据时的占位横条 */
  sparkPlaceholder: {
    width: SPARK_WIDTH,
    height: SPARK_HEIGHT,
    borderRadius: SPARK_HEIGHT / 2,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  /** 实时监测绿点 */
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
});
