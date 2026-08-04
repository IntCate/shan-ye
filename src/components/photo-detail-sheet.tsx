/**
 * 照片详情底部卡片（native）。
 *
 * 点击地图上的照片图片 Marker 后，以 iOS 风格底部卡片从屏幕底部向上滑出。
 *
 * 关键设计：
 * - 使用 Modal 渲染，层级高于底部 Tab 栏，遮罩与卡片覆盖整屏（含安全区），
 *   解决此前「卡片浮在 Tab 栏上方、未完整覆盖底部」的问题。
 * - 卡片背景色延伸至屏幕底边（paddingBottom 含安全区在内），无透明缝隙。
 * - iOS 风格：顶部圆角 20 + grabber 抓手 + 照片大图 + 拍摄信息（时间、经纬度）。
 *
 * 交互：
 * - 整张卡片绑定 Pan 手势（createDismissPan）：向下跟随手指（向上钳制在 0），
 *   松手超过阈值或快速下甩则关闭并下滑淡出，否则回弹。作用于整张卡片 →
 *   「任意位置下滑关闭」。
 * - 抓手（横杠）点击关闭。
 * - 点击卡片以外的遮罩区域或 Android 返回键关闭。
 *
 * 骨架/动画：Modal 结构、遮罩/抓手样式、打开/关闭动画、拖拽手势均复用
 * useBottomSheet + BottomSheetModal（与 ProfileSheet 共用）。
 *
 * 组件常驻挂载（由父级始终渲染），内部按 photo 提前 return：photo 为 null 时不渲染 Modal。
 * 打开动画由 photo 的 null→非 null 过渡驱动（见下方 effect），关闭由 close / 拖拽驱动。
 */

import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { BottomSheetModal } from '@/components/ui/bottom-sheet-modal';
import { ThemedText } from '@/components/themed-text';
import { createDismissPan, useBottomSheet } from '@/hooks/use-bottom-sheet';
import type { GeoTaggedPhoto } from '@/types/geotagged-photo';
import { formatLatLng } from '@/utils/geo';

/** 卡片高度。 */
const SHEET_HEIGHT = 360;

export function PhotoDetailSheet({
  photo,
  onClose,
}: {
  photo: GeoTaggedPhoto | null;
  onClose: () => void;
}) {
  const height = useSharedValue(SHEET_HEIGHT);
  const { translateY, backdropOpacity, open, close } = useBottomSheet({
    onClose,
    height,
    initialHeight: SHEET_HEIGHT,
  });

  // 记录上一次 photo，用于检测 null→非 null 的「打开」过渡。
  // PhotoDetailSheet 常驻挂载（仅内部按 photo 提前 return），不能用 [] 依赖——
  // 那只在初始 photo=null 时跑一次，会导致首次打开无动画、关闭后再点无反应。
  const prevPhotoRef = useRef<GeoTaggedPhoto | null>(null);

  // 打开时（photo 由 null 变为非 null）：先把共享值重置到隐藏态，再动画进入。
  useEffect(() => {
    const isOpening = photo !== null && prevPhotoRef.current === null;
    prevPhotoRef.current = photo;
    if (!isOpening) return;
    open();
  }, [photo, open]);

  // 纯关闭式拖拽手势：向上钳制在 0，松手超阈值或快速下甩则关闭
  const pan = createDismissPan({ translateY, backdropOpacity, height, onClose: close });

  if (!photo) return null;

  const coord = formatLatLng(photo.latitude, photo.longitude);

  return (
    <BottomSheetModal
      onDismiss={close}
      pan={pan}
      translateY={translateY}
      backdropOpacity={backdropOpacity}
      height={height}>
      <Image source={{ uri: photo.id }} style={styles.image} contentFit="cover" />
      <View style={styles.info}>
        <ThemedText type="smallBold">{new Date(photo.creationTime).toLocaleString()}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {coord.lat}  {coord.lng}
        </ThemedText>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  image: {
    marginTop: 8,
    marginHorizontal: 16,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#cccccc',
  },
  info: {
    marginTop: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
});
