/**
 * 路径管理浮层（native）。
 *
 * 浮层卡片，由首页「路径」悬浮按钮触发，定位到按钮左侧（与图层选择器同模式）。
 * 结构：标题 + 导入按钮 → 错误条（可选）→ 路线列表（显隐切换 / 点击定位 / 删除）。
 *
 * 视觉与 MapLayerMenu 同源：GlassPanel + BubbleTail(direction="right")，
 * iOS 26 Liquid Glass 下图标不设 tintColor 走系统 luminance 适配；
 * 按压反馈用 scale 而非 opacity（opacity<1 会导致玻璃不渲染）。
 *
 * 列表项前缀彩色圆点与地图 Polyline 颜色一致，便于对应识别。
 */

import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';

import { BubbleTail } from '@/components/bubble-tail';
import { GlassPanel, liquidGlassAvailable } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Glass, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Route } from '@/types/route';

type RouteManagerPanelProps = {
  routes: Route[];
  loading: boolean;
  error: string | null;
  /** 触发文档选择器导入文件。 */
  onImport: () => void;
  /** 切换某条路线显隐。 */
  onToggle: (id: string) => void;
  /** 循环切换坐标模式（raw → toWgs84 → toGcj02），用于修正坐标系不匹配偏移。 */
  onCycleCoordMode: (id: string) => void;
  /** 删除某条路线。 */
  onRemove: (id: string) => void;
  /** 点击路线名称：定位地图到该路线包围盒。 */
  onSelect: (route: Route) => void;
  /** 关闭错误提示。 */
  onDismissError: () => void;
};

export function RouteManagerPanel({
  routes,
  loading,
  error,
  onImport,
  onToggle,
  onCycleCoordMode,
  onRemove,
  onSelect,
  onDismissError,
}: RouteManagerPanelProps) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  // iOS 26 Liquid Glass：不设 tintColor 走系统 luminance 适配；其他平台用主题色保证可见性
  const iconTint = liquidGlassAvailable ? undefined : theme.text;

  return (
    <View style={styles.wrap}>
      <GlassPanel style={styles.cardOuter} contentStyle={styles.cardContent}>
        {/* 标题 + 导入按钮 */}
        <View style={styles.header}>
          <ThemedText type="smallBold">路径</ThemedText>
          <Pressable
            onPress={onImport}
            disabled={loading}
            style={({ pressed }) => [styles.importBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="导入路径文件">
            {loading ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <SymbolView
                name={{ ios: 'folder.badge.plus', android: 'folder_open', web: 'folder_open' }}
                size={20}
                tintColor={iconTint}
              />
            )}
          </Pressable>
        </View>

        {/* 错误条 */}
        {error && (
          <View style={styles.errorBar}>
            <ThemedText type="small" style={styles.errorText} numberOfLines={2}>
              {error}
            </ThemedText>
            <Pressable
              onPress={onDismissError}
              hitSlop={Spacing.two}
              style={({ pressed }) => [styles.errorClose, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={14}
                tintColor={iconTint}
              />
            </Pressable>
          </View>
        )}

        {/* 路线列表 / 空状态 */}
        {routes.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText type="small" themeColor="textSecondary">
              暂无路径，点击导入按钮添加
            </ThemedText>
          </View>
        ) : (
          <ScrollView style={styles.list} bounces={false}>
            {routes.map((r) => (
              <View key={r.id} style={styles.row}>
                {/* 彩色圆点：与地图 Polyline 颜色一致 */}
                <View style={[styles.colorDot, { backgroundColor: r.color }]} />
                {/* 显隐切换 */}
                <Pressable
                  onPress={() => onToggle(r.id)}
                  hitSlop={Spacing.one}
                  style={({ pressed }) => [styles.toggleBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={r.visible ? '隐藏路径' : '显示路径'}>
                  <SymbolView
                    name={
                      r.visible
                        ? { ios: 'eye', android: 'visibility', web: 'visibility' }
                        : { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
                    }
                    size={18}
                    tintColor={iconTint}
                  />
                </Pressable>
                {/* 路线名称：点击定位 */}
                <Pressable
                  onPress={() => onSelect(r)}
                  style={({ pressed }) => [styles.nameBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`定位到 ${r.name}`}>
                  <ThemedText type="small" numberOfLines={1} style={!r.visible && styles.hiddenName}>
                    {r.name}
                  </ThemedText>
                </Pressable>
                {/* 坐标模式三态切换：raw（原始）→ toWgs84（GCJ-02→WGS-84 纠偏）→ toGcj02（WGS-84→GCJ-02 加偏）→ raw。
                    国内轨迹文件与地图底图坐标系不匹配时，循环切换找到最佳对齐：
                    - raw（默认色）：不转换
                    - toWgs84（路线色）：GCJ-02 纠偏，适用于文件是 GCJ-02 且地图期望 WGS-84
                    - toGcj02（绿色 #34C759）：WGS-84 加偏，适用于文件是 WGS-84 但卫星图底图用 GCJ-02 且不自动转换 */}
                <Pressable
                  onPress={() => onCycleCoordMode(r.id)}
                  hitSlop={Spacing.one}
                  style={({ pressed }) => [styles.coordBtn, pressed && styles.pressed]}
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
                    size={16}
                    tintColor={
                      r.coordMode === 'toWgs84'
                        ? r.color
                        : r.coordMode === 'toGcj02'
                          ? '#34C759'
                          : iconTint
                    }
                  />
                </Pressable>
                {/* 删除 */}
                <Pressable
                  onPress={() => onRemove(r.id)}
                  hitSlop={Spacing.one}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`删除 ${r.name}`}>
                  <SymbolView
                    name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                    size={16}
                    tintColor={iconTint}
                  />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
      </GlassPanel>
      {/* 右侧尾巴：向右三角形指向「路径」按钮，颜色与玻璃 overlay 同色以无缝衔接 */}
      <BubbleTail direction="right" color={isDark ? Glass.overlayDark : Glass.overlayLight} size={8} />
    </View>
  );
}

const styles = StyleSheet.create({
  /** 卡片 + 尾巴的水平容器：尾巴垂直居中贴在卡片右侧。 */
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** 外层：圆角 + 阴影 + 宽度区间（不裁剪，阴影可见） */
  cardOuter: {
    borderRadius: 12,
    minWidth: 220,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  /** 内层内容：纵向 padding 移到 contentStyle */
  cardContent: {
    paddingVertical: Spacing.one,
    gap: Spacing.one,
  },
  /** 标题行：标题左、导入按钮右 */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  importBtn: {
    padding: Spacing.half,
  },
  /** 错误条：红字 + 关闭按钮 */
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    marginHorizontal: Spacing.two,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    color: '#FF3B30',
  },
  errorClose: {
    padding: Spacing.half,
  },
  /** 空状态居中提示 */
  empty: {
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  /** 列表区：超出滚动 */
  list: {
    maxHeight: 280,
  },
  /** 单条路线行：圆点 + 显隐 + 名称 + 删除 */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  /** 彩色圆点：与 Polyline 颜色对应 */
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toggleBtn: {
    padding: Spacing.half,
  },
  nameBtn: {
    flex: 1,
  },
  /** GCJ-02 纠偏切换按钮 */
  coordBtn: {
    padding: Spacing.half,
  },
  /** 隐藏路线名称降低对比度（但仍可读，标识其隐藏状态） */
  hiddenName: {
    opacity: 0.5,
  },
  deleteBtn: {
    padding: Spacing.half,
  },
  /** 用 scale 而非 opacity：iOS 26 Liquid Glass 下父视图 opacity<1 会导致玻璃不渲染。 */
  pressed: {
    transform: [{ scale: 0.9 }],
  },
});
