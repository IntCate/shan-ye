/**
 * 相册网格：视频单元。
 *
 * expo-image 不解码视频帧，必须用 expo-video 的 generateThumbnailsAsync 生成首帧缩略图，
 * 再把 VideoThumbnail 作为 expo-image 的 source（expo-image source 接受 SharedRef<'image'>）。
 * 缩略图生成需 player 进入 readyToPlay 状态，故监听 statusChange 事件。
 *
 * 叠加：右下角播放图标 + 左下角时长角标。
 */

import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type View as RNView } from 'react-native';
import { useVideoPlayer, type VideoThumbnail } from 'expo-video';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { PhotoItem, Rect } from '@/types/photo-album';

type Props = {
  item: PhotoItem;
  onPress: (rect: Rect) => void;
};

/** 毫秒 → M:SS 格式。 */
function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoThumbCell({ item, onPress }: Props) {
  const ref = useRef<RNView>(null);
  // 静音：网格单元只生成缩略图，不发声
  const player = useVideoPlayer({ uri: item.uri }, (p) => {
    p.muted = true;
  });
  const [thumb, setThumb] = useState<VideoThumbnail | null>(null);

  const handlePress = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      onPress({ x, y, width, height });
    });
  };

  useEffect(() => {
    let cancelled = false;
    let generated = false;

    const tryGenerate = () => {
      if (generated) return;
      generated = true;
      player
        .generateThumbnailsAsync([0], { maxWidth: 300, maxHeight: 300 })
        .then((thumbs) => {
          if (!cancelled && thumbs[0]) setThumb(thumbs[0]);
        })
        .catch(() => {});
    };

    const sub = player.addListener('statusChange', (payload) => {
      if (payload.status === 'readyToPlay') tryGenerate();
    });

    // 兜底：mount 时若已 readyToPlay（事件已错过），直接尝试
    if (player.status === 'readyToPlay') tryGenerate();

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [player]);

  return (
    <Pressable ref={ref} onPress={handlePress} style={({ pressed }) => pressed && styles.pressed}>
      {thumb ? (
        <Image
          source={thumb}
          style={styles.cell}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
        />
      ) : (
        <ThemedView type="backgroundElement" style={styles.cell} />
      )}
      {/* 播放图标 */}
      <View style={styles.playBadge} pointerEvents="none">
        <SymbolView
          name={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
          size={16}
          tintColor="#ffffff"
        />
      </View>
      {/* 时长角标 */}
      {item.duration != null && item.duration > 0 && (
        <View style={styles.durationBadge} pointerEvents="none">
          <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    aspectRatio: 1,
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  playBadge: {
    position: 'absolute',
    bottom: Spacing.one,
    right: Spacing.one,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.one,
    left: Spacing.one,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
});
