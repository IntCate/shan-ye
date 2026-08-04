/**
 * 地图长按「保存标点」悬浮卡片：红点 + 坐标卡片（可编辑名称），底部「添加 / 收藏」保存、「取消」关闭。
 *
 * 长按地图空白时由首页挂载；红点标记长按位置，玻璃坐标卡片悬浮在红点上方（BubbleTail 尾巴指向红点），
 * 定位使用长按点的 MapView 内像素坐标（x/y），与地图容器同基准。
 * 「添加」「收藏」为同一标点列表的两种入口（收藏带星标语义），均保存当前坐标；
 * 点击地图空白、地图移动或取消时关闭。卡片外区域 pointerEvents 穿透，点击落到地图（触发 onPress 关闭）。
 */

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, useColorScheme } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { BubbleTail } from '@/components/bubble-tail';
import { GlassPanel, liquidGlassAvailable } from '@/components/glass-panel';
import { ThemedText } from '@/components/themed-text';
import { Glass, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatLatLng } from '@/utils/geo';

/** 长按位置红色标记小球尺寸（px）。 */
const DOT_SIZE = 12;
const DOT_RADIUS = DOT_SIZE / 2;

type MapSavePlacemarkCardProps = {
  latitude: number;
  longitude: number;
  /** 长按点在 MapView 内的像素坐标（相对地图容器，卡片与红点据此定位）。 */
  x: number;
  y: number;
  /** 名称初始值（默认「标点 N」）。 */
  defaultName: string;
  onSave: (name: string) => void;
  onClose: () => void;
};

/** 保存按钮主色（iOS 系统蓝，深浅色通用可读）。 */
const SYSTEM_BLUE = '#0A84FF';
/** 收藏按钮主色（iOS 橙色）。 */
const FAVORITE_ORANGE = '#FF9F0A';
/** 取消按钮主色（iOS 系统灰）。 */
const CANCEL_GRAY = '#8E8E93';

export function MapSavePlacemarkCard({
  latitude,
  longitude,
  x,
  y,
  defaultName,
  onSave,
  onClose,
}: MapSavePlacemarkCardProps) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const [name, setName] = useState(defaultName);
  const coord = formatLatLng(latitude, longitude);

  const handleSave = () => {
    onSave(name.trim() || defaultName);
  };

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {/* 红色小球：标记长按位置 */}
      <View pointerEvents="none" style={[styles.dot, { left: x, top: y }]} />
      {/* 坐标卡片 + 尾巴：尾巴尖端指向小球顶部 */}
      <View style={[styles.cardWrap, { left: x, top: y - DOT_RADIUS - Spacing.two }]}>
        <GlassPanel style={styles.cardOuter} contentStyle={styles.cardContent}>
          <View style={styles.header}>
            <ThemedText type="smallBold">保存为标点</ThemedText>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="关闭">
              <SymbolView
                name="xmark"
                size={14}
                tintColor={liquidGlassAvailable ? undefined : theme.textSecondary}
              />
            </Pressable>
          </View>

          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {coord.lat}　{coord.lng}
          </ThemedText>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="标点名称"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <View style={styles.actions}>
            {/* 「添加」「收藏」「取消」同款按钮，flex:1 均分卡片宽度 */}
            <Pressable onPress={handleSave} hitSlop={4} style={[styles.actionBtn, { backgroundColor: SYSTEM_BLUE }]}>
              <SymbolView name="plus" size={14} tintColor="#ffffff" />
              <ThemedText type="smallBold" style={styles.actionText}>
                添加
              </ThemedText>
            </Pressable>
            <Pressable onPress={handleSave} hitSlop={4} style={[styles.actionBtn, { backgroundColor: FAVORITE_ORANGE }]}>
              <SymbolView name="star.fill" size={14} tintColor="#ffffff" />
              <ThemedText type="smallBold" style={styles.actionText}>
                收藏
              </ThemedText>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={4} style={[styles.actionBtn, { backgroundColor: CANCEL_GRAY }]}>
              <SymbolView name="xmark" size={14} tintColor="#ffffff" />
              <ThemedText type="smallBold" style={styles.actionText}>
                取消
              </ThemedText>
            </Pressable>
          </View>
        </GlassPanel>
        <BubbleTail
          direction="down"
          color={isDark ? Glass.overlayDark : Glass.overlayLight}
          size={6}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** 全屏容器：卡片外区域穿透（点击落到地图），卡片与红点按长按点像素坐标 absolute 定位 */
  wrap: {
    ...StyleSheet.absoluteFill,
  },
  /** 红点：长按位置标记 */
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_RADIUS,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: '#ffffff',
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
  },
  /** 卡片容器：悬浮在红点上方，水平居中、整体上移（translateY -100% 使尾巴底部贴红点） */
  cardWrap: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
  },
  /** 外层：圆角 + 阴影 + 最大宽度（不裁剪，阴影可见） */
  cardOuter: {
    borderRadius: 8,
    maxWidth: 240,
    ...Shadow.md,
  },
  /** 内层内容：padding/gap 移到 contentStyle */
  cardContent: {
    padding: Spacing.two,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    height: 36,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  /** 「添加」「收藏」「取消」同款主按钮：flex:1 均分宽度，图标 + 文字居中横排 */
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  actionText: {
    color: '#ffffff',
  },
});
