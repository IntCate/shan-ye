/**
 * 相册 3 列方格网格。
 *
 * 用 FlatList numColumns=3，方格 aspectRatio:1，列间/行间 2px 缝隙（仿 iOS Photos）。
 * 支持下拉刷新 + onEndReached 分页加载更多。视频单元用 VideoThumbCell，图片用 PhotoThumbCell。
 */

import { MediaType } from 'expo-media-library';
import { ActivityIndicator, Dimensions, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

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
  hasMore: boolean;
  /** 底部留白，避免最后内容被 Tab Bar 遮挡。 */
  bottomInset?: number;
  onItemPress: (index: number, rect: Rect) => void;
  onEndReached: () => void;
  onRefresh: () => void;
};

export function PhotoGrid({
  items,
  loading,
  refreshing,
  hasMore,
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
      renderItem={({ item, index }) => {
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
      }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />
      }
      contentContainerStyle={{ paddingBottom: bottomInset }}
      ListFooterComponent={
        loading ? (
          <ActivityIndicator style={styles.footer} color={theme.text} />
        ) : !hasMore && items.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
            没有更多照片
          </ThemedText>
        ) : null
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
  footerText: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
  empty: {
    textAlign: 'center',
    paddingTop: Spacing.six,
  },
});
