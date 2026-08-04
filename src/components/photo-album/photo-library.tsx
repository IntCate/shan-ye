/**
 * 照片库组件（native）。
 *
 * 原相册页（explore Tab）功能迁入「我的」面板的「照片」扩展态：
 * 权限门控（undetermined / denied / limited / granted 四态）+ limited 条幅 + 网格 + 查看器编排。
 * 权限通过后才挂载 PhotoLibraryContent（内含 usePhotoAlbum），避免无权限时白白查询。
 * 无顶栏 / safe-area（由宿主面板提供），组件撑满父容器。
 */

import { presentPermissionsPicker } from 'expo-media-library';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useMediaLibraryPermission } from '@/hooks/use-media-library-permission';
import { usePhotoAlbum } from '@/hooks/use-photo-album';
import type { Rect } from '@/types/photo-album';

import { PhotoGrid } from './photo-grid';
import { PhotoViewer } from './photo-viewer';

export function PhotoLibrary({
  onViewerOpenChange,
}: {
  /** 查看器打开状态变化通知：宿主（个人面板）据此在查看器打开期间禁用下滑/点击关闭，
   *  防止 overFullScreen 透明 Modal 层叠的触摸穿透误关面板。 */
  onViewerOpenChange?: (open: boolean) => void;
}) {
  const { status, limited, requestPermission } = useMediaLibraryPermission();

  return (
    // 负 margin 抵消宿主面板 expandedContent 的水平 padding（16px），让 PhotoGrid
    // 按全屏宽计算的格子尺寸（cellSize 基于 screenWidth）铺满面板宽度，不溢出。
    <View style={styles.container}>
      {status === 'undetermined' ? (
        <PermissionPrompt
          text="照片面板需要访问相册以显示照片和视频"
          button="授权访问"
          onPress={() => requestPermission()}
        />
      ) : status === 'denied' ? (
        <PermissionPrompt
          text="权限被拒绝，请在系统设置中开启相册访问权限"
          button="前往设置"
          onPress={() => Linking.openSettings()}
        />
      ) : status === 'granted' ? (
        <PhotoLibraryContent limited={limited} onViewerOpenChange={onViewerOpenChange} />
      ) : null}
    </View>
  );
}

/** 权限未授权/被拒时的居中提示 + 按钮。 */
function PermissionPrompt({
  text,
  button,
  onPress,
}: {
  text: string;
  button: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.center}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        {text}
      </ThemedText>
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="linkPrimary">{button}</ThemedText>
        </ThemedView>
      </Pressable>
    </View>
  );
}

/** 权限通过后的内容：数据 hook + limited 条幅 + 网格 + 查看器。 */
function PhotoLibraryContent({
  limited,
  onViewerOpenChange,
}: {
  limited: boolean;
  onViewerOpenChange?: (open: boolean) => void;
}) {
  const { items, loading, refreshing, error, loadMore, refresh } = usePhotoAlbum();
  const [viewer, setViewer] = useState<{ index: number; rect: Rect } | null>(null);

  // 打开/关闭查看器时同步通知宿主：查看器打开期间个人面板禁用下滑/点击关闭，
  // 避免 overFullScreen 透明 Modal 层叠的触摸穿透误关面板（查看器关闭后恢复）。
  const openViewer = (index: number, rect: Rect) => {
    setViewer({ index, rect });
    onViewerOpenChange?.(true);
  };
  const closeViewer = () => {
    setViewer(null);
    onViewerOpenChange?.(false);
  };

  return (
    <>
      {limited && (
        <View style={styles.limitedBanner}>
          <ThemedText type="small" themeColor="textSecondary">
            仅显示选中的照片
          </ThemedText>
          <Pressable onPress={() => presentPermissionsPicker()}>
            <ThemedText type="linkPrimary">管理…</ThemedText>
          </Pressable>
        </View>
      )}

      {error ? (
        <View style={styles.center}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            加载失败：{error.message}
          </ThemedText>
          <Pressable onPress={refresh} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundElement" style={styles.button}>
              <ThemedText type="linkPrimary">重试</ThemedText>
            </ThemedView>
          </Pressable>
        </View>
      ) : (
        <PhotoGrid
          items={items}
          loading={loading}
          refreshing={refreshing}
          onItemPress={openViewer}
          onEndReached={loadMore}
          onRefresh={refresh}
        />
      )}

      {viewer && (
        <PhotoViewer
          items={items}
          initialIndex={viewer.index}
          sourceRect={viewer.rect}
          onClose={closeViewer}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // 抵消宿主面板 expandedContent 的水平 padding，网格铺满面板宽度
    marginHorizontal: -Spacing.three,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  centerText: {
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  limitedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
});
