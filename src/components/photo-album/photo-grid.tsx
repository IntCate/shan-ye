/**
 * 相册 3 列方格网格。
 *
 * 用 FlatList numColumns=3，方格 aspectRatio:1，列间/行间 2px 缝隙（仿 iOS Photos）。
 * 支持下拉刷新 + onEndReached 分页加载更多。视频单元用 VideoThumbCell，图片用 PhotoThumbCell。
 *
 * 性能：cell 抽成 memo 组件（PhotoCell），props 仅 item/index/onItemPress——父级
 * onItemPress 用 useCallback 稳定，分页加载时已渲染项的 item 引用不变，重渲染被跳过，
 * 避免照片单元（expo-image 解码等）全量重渲染导致的 VirtualizedList 慢更新警告。
 */

import { MediaType } from 'expo-media-library';
import { memo } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PhotoItem, Rect } from '@/types/photo-album';

import { PhotoThumbCell } from './photo-thumb-cell';
import { VideoThumbCell } from './video-thumb-cell';

const NUM_COLUMNS = 3;
const GAP = Spacing.half; // 2px
const screenWidth = Dimensions.get('window').width;
const cellSize = (screenWidth - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

type Props = {
  items: PhotoItem[];
  loading: boolean;
  refreshing: boolean;
  /** 底部留白，避免最后内容被 Tab Bar 遮挡。 */
  bottomInset?: number;
  onItemPress: (index: number, rect: Rect) => void;
  onEndReached: () => void;
  onRefresh: () => void;
};

/** 网格单元（外层 Wrap + 图片/视频分支）。memo：item/index/onItemPress 不变则跳过重渲染。 */
const PhotoCell = memo(function PhotoCell({
  item,
  index,
  onItemPress,
}: {
  item: PhotoItem;
  index: number;
  onItemPress: (index: number, rect: Rect) => void;
}) {
  const isLastCol = (index + 1) % NUM_COLUMNS === 0;
  return (
    <View style={[styles.cellWrap, !isLastCol && styles.cellGap]}>
      {item.mediaType === MediaType.VIDEO ? (
        <VideoThumbCell item={item} onPress={(rect) => onItemPress(index, rect)} />
      ) : (
        <PhotoThumbCell item={item} onPress={(rect) => onItemPress(index, rect)} />
      )}
    </View>
  );
});

export function PhotoGrid({
  items,
  loading,
  refreshing,
  bottomInset,
  onItemPress,
  onEndReached,
  onRefresh,
}: Props) {
  const theme = useTheme();

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={NUM_COLUMNS}
      renderItem={({ item, index }) => <PhotoCell item={item} index={index} onItemPress={onItemPress} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />
      }
      contentContainerStyle={{ paddingBottom: bottomInset }}
      ListFooterComponent={
        loading ? <ActivityIndicator style={styles.footer} color={theme.text} /> : null
      }
      ListEmptyComponent={
        !loading && !refreshing ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            相册为空
          </ThemedText>
        ) : null
      }
      initialNumToRender={12}
      maxToRenderPerBatch={24}
      windowSize={7}
      // iOS 下裁剪视口外节点，减少滚动时图片解码开销（Android 存在已知 bug，不开）
      removeClippedSubviews={Platform.OS === 'ios'}
    />
  );
}

const styles = StyleSheet.create({
  cellWrap: {
    width: cellSize,
    marginBottom: GAP,
  },
  cellGap: {
    marginRight: GAP,
  },
  footer: {
    paddingVertical: Spacing.four,
  },
  empty: {
    textAlign: 'center',
    paddingTop: Spacing.six,
  },
});
