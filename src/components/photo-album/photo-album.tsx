/**
 * 相册容器（native）。
 *
 * 职责：权限门控（undetermined / denied / limited / granted 四态）+ 顶栏 + 网格 + 查看器编排。
 * 权限通过后才挂载 PhotoAlbumContent（内含 usePhotoAlbum），避免无权限时白白查询。
 */

import { presentPermissionsPicker, usePermissions } from 'expo-media-library';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { usePhotoAlbum } from '@/hooks/use-photo-album';
import type { Rect } from '@/types/photo-album';

import { PhotoGrid } from './photo-grid';
import { PhotoViewer } from './photo-viewer';

export function PhotoAlbum() {
  const insets = useSafeAreaInsets();
  const [perm, requestPermission] = usePermissions();
  const granted = perm?.status === 'granted';

  return (
    <ThemedView style={styles.container}>
      {!perm || perm.status === 'undetermined' ? (
        <PermissionPrompt
          text="相册需要访问权限以显示照片和视频"
          button="授权访问"
          onPress={() => requestPermission()}
        />
      ) : perm.status === 'denied' ? (
        <PermissionPrompt
          text="权限被拒绝，请在系统设置中开启相册访问权限"
          button="前往设置"
          onPress={() => Linking.openSettings()}
        />
      ) : granted ? (
        <PhotoAlbumContent
          limited={perm.accessPrivileges === 'limited'}
          bottomInset={insets.bottom + BottomTabInset}
        />
      ) : null}
    </ThemedView>
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
function PhotoAlbumContent({
  limited,
  bottomInset,
}: {
  limited: boolean;
  bottomInset: number;
}) {
  const insets = useSafeAreaInsets();
  const { items, loading, refreshing, hasMore, error, loadMore, refresh } = usePhotoAlbum();
  const [viewer, setViewer] = useState<{ index: number; rect: Rect } | null>(null);

  return (
    <>
      {/* 顶栏 */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <ThemedText type="subtitle">相册</ThemedText>
      </View>

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
          hasMore={hasMore}
          bottomInset={bottomInset}
          onItemPress={(index, rect) => setViewer({ index, rect })}
          onEndReached={loadMore}
          onRefresh={refresh}
        />
      )}

      {viewer && (
        <PhotoViewer
          items={items}
          initialIndex={viewer.index}
          sourceRect={viewer.rect}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
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
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
