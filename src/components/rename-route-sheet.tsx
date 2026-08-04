"use no memo";
/**
 * 重命名路径弹层：输入新名称，确定后回调。样式与登录面板一致（BottomSheetModal 底部弹层）。
 *
 * 由 ProfileSheet 作为其 Modal 的 children 嵌套渲染（同 LoginSheet 模式），避免两个
 * 顶层原生 Modal 同时 present 触发 UIKit "already presenting" 崩溃。每次打开重置输入框
 * 为当前名称并自动聚焦；名称为空时「确定」禁用。
 *
 * 本文件使用 "use no memo"：含 sharedValue + Pan worklet，React Compiler 会干扰
 * shared value 与 worklet 的同步（与 login-sheet / bottom-sheet-modal 同因）。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { BottomSheetModal } from '@/components/ui/bottom-sheet-modal';
import { Spacing } from '@/constants/theme';
import { ANIM_DURATION, createDismissPan, useBottomSheet } from '@/hooks/use-bottom-sheet';
import { useTheme } from '@/hooks/use-theme';

const COLOR_BLUE = '#0A84FF';
const COLOR_GRAY = '#8E8E93';

/** 面板固定高度（标题 + 输入框 + 操作按钮）。 */
const RENAME_HEIGHT = 212;

type RenameRouteSheetProps = {
  visible: boolean;
  /** 当前路径名称（作为输入框初值）。 */
  currentName: string;
  /** 确定回调（传新的名称，已去首尾空格）。 */
  onConfirm: (name: string) => void;
  onClose: () => void;
};

export function RenameRouteSheet({ visible, currentName, onConfirm, onClose }: RenameRouteSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(currentName);
  // 软键盘高度：键盘弹出时卡片高度 = 内容高 + 键盘高，保证内容（输入框）始终在键盘上方
  const [kbHeight, setKbHeight] = useState(0);

  const height = useSharedValue(RENAME_HEIGHT);
  const { translateY, backdropOpacity, open, close } = useBottomSheet({
    onClose,
    height,
    initialHeight: RENAME_HEIGHT,
  });
  const pan = useMemo(
    () => createDismissPan({ translateY, backdropOpacity, height, onClose }),
    [translateY, backdropOpacity, height, onClose]
  );

  // 监听软键盘显隐：卡片高度随键盘伸缩（iOS 键盘会盖住底部卡片，Android resize 兜底）
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKbHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // 键盘高度变化 → 同步伸缩卡片高度（内容固定在顶部，键盘只扩展卡片底部被遮挡区）。
  // 用 withTiming 与键盘弹出动画同步，避免内容瞬间被键盘盖住。
  useEffect(() => {
    if (!visible) return;
    height.value = withTiming(kbHeight > 0 ? RENAME_HEIGHT + kbHeight : RENAME_HEIGHT, {
      duration: ANIM_DURATION,
    });
  }, [kbHeight, visible, height]);

  const prevVisibleRef = useRef(false);
  useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!isOpening) return;
    // 每次打开重置为当前名称，避免沿用上次编辑残留
    setName(currentName);
    open();
  }, [visible, currentName, open]);

  if (!visible) return null;

  const trimmed = name.trim();

  const handleConfirm = () => {
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <BottomSheetModal
      onDismiss={close}
      pan={pan}
      translateY={translateY}
      backdropOpacity={backdropOpacity}
      height={height}
      bottomPadding={insets.bottom + Spacing.two}>
      <View style={styles.content}>
        {/* 标题行 */}
        <View style={styles.header}>
          <ThemedText type="smallBold">重命名路径</ThemedText>
          <Pressable onPress={close} hitSlop={8} accessibilityLabel="关闭">
            <SymbolView name="xmark" size={16} tintColor={theme.textSecondary} />
          </Pressable>
        </View>

        {/* 名称输入 */}
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="请输入新的路径名称"
          placeholderTextColor={theme.textSecondary}
          autoFocus
          maxLength={30}
          onSubmitEditing={handleConfirm}
          returnKeyType="done"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        {/* 取消 / 确定 */}
        <View style={styles.actions}>
          <Pressable
            onPress={close}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: COLOR_GRAY },
              pressed && styles.pressed,
            ]}
            accessibilityLabel="取消">
            <ThemedText type="smallBold" style={styles.actionText}>
              取消
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            disabled={!trimmed}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: COLOR_BLUE },
              !trimmed && styles.disabled,
              pressed && styles.pressed,
            ]}
            accessibilityLabel="确定">
            <ThemedText type="smallBold" style={styles.actionText}>
              确定
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    height: 44,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  actionText: {
    color: '#ffffff',
  },
});
