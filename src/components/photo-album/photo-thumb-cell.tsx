/**
 * 相册网格：图片单元。
 *
 * 用 expo-image 显示图片，contentFit="cover" 填满方格，memory-disk 缓存。
 * 按下时通过 measureInWindow 测量自身屏幕坐标，传给查看器作为拖拽下滑动画的目标位置。
 */

import { Image } from 'expo-image';
import { useRef } from 'react';
import { Pressable, StyleSheet, type View } from 'react-native';

import type { PhotoItem, Rect } from '@/types/photo-album';

type Props = {
  item: PhotoItem;
  onPress: (rect: Rect) => void;
};

export function PhotoThumbCell({ item, onPress }: Props) {
  const ref = useRef<View>(null);

  const handlePress = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      onPress({ x, y, width, height });
    });
  };

  return (
    <Pressable ref={ref} onPress={handlePress} style={({ pressed }) => pressed && styles.pressed}>
      <Image
        source={item.uri}
        style={styles.cell}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
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
});
