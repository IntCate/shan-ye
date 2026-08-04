/**
 * 照片库组件（native）。
 *
 * 原相册页（explore Tab）功能迁入「我的」面板的「照片」扩展态：
 * 权限门控（undetermined / denied / limited / granted 四态）+ limited 条幅 + 网格 + 查看器编排。
 * 权限通过后才挂载 PhotoLibraryContent（内含 usePhotoAlbum），避免无权限时白白查询。
 * 无顶栏 / safe-area（由宿主面板提供），组件撑满父容器。
 */

import { presentPermissionsPicker } from 'expo-media-library';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

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
        <PhotoLibraryContent
          limited={limited}
          onRequestFullAccess={() => requestPermission()}
          onViewerOpenChange={onViewerOpenChange}
        />
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
  onRequestFullAccess,
  onViewerOpenChange,
}: {
  limited: boolean;
  /** limited 下点击「开启完整访问」：再次请求系统授权（iOS 17+ 弹升级框）。 */
  onRequestFullAccess: () => void;
  onViewerOpenChange?: (open: boolean) => void;
}) {
  const { items, loading, refreshing, error, loadMore, refresh } = usePhotoAlbum();
  const [viewer, setViewer] = useState<{ index: number; rect: Rect } | null>(null);

  // 「开启完整访问」请求后的 limited 变化跟踪：iOS 17+ 系统会弹「允许访问所有照片」
  // 升级框（limited→full 后照片全量显示；视频受 iOS 18+ 限制仍不可预览）；
  // iOS 16 及更早再次请求不弹框（仍 limited），此时自动跳系统设置手动切换。
  const [pendingFullAccess, setPendingFullAccess] = useState(false);
  const prevLimited = useRef(limited);
  useEffect(() => {
    if (!pendingFullAccess) {
      prevLimited.current = limited;
      return;
    }
    if (limited && Number(Platform.Version) < 17) {
      Linking.openSettings();
    }
    setPendingFullAccess(false);
    prevLimited.current = limited;
  }, [limited, pendingFullAccess]);

  // 打开/关闭查看器时同步通知宿主：查看器打开期间个人面板禁用下滑/点击关闭，
  // 避免 overFullScreen 透明 Modal 层叠的触摸穿透误关面板（查看器关闭后恢复）。
  // useCallback 稳定引用：PhotoGrid 的 memo Cell 依赖它做重渲染跳过。
  const openViewer = useCallback(
    (index: number, rect: Rect) => {
      setViewer({ index, rect });
      onViewerOpenChange?.(true);
    },
    [onViewerOpenChange]
  );
  const closeViewer = useCallback(() => {
    setViewer(null);
    onViewerOpenChange?.(false);
  }, [onViewerOpenChange]);

  return (
    <>
      {limited && (
        <View style={styles.limitedBanner}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.limitedText}>
            仅显示选中的照片
          </ThemedText>
          <View style={styles.limitedActions}>
            {/* 开启完整访问：再次请求系统授权。iOS 17+ 弹「允许访问所有照片」升级框；
                iOS 16 及更早不弹框（仍 limited），由上方 effect 自动跳系统设置。 */}
            <Pressable
              onPress={() => {
                setPendingFullAccess(true);
                onRequestFullAccess();
              }}
            >
              <ThemedText type="linkPrimary">开启完整访问</ThemedText>
            </Pressable>
            {/* 管理…：iOS 系统「选中的照片」勾选器，可追加授权具体照片/视频 */}
            <Pressable onPress={() => presentPermissionsPicker()}>
              <ThemedText type="linkPrimary">管理…</ThemedText>
            </Pressable>
          </View>
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
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  limitedText: {
    flexShrink: 1,
  },
  limitedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
