/**
 * 登录面板：手机号一键登录（验证码，演示码 123456）/ 账号密码登录 可切换，
 * 底部微信 / QQ 快捷登录（本地模拟直接成功）。样式与个人面板一致（BottomSheetModal 底部弹层）。
 *
 * 本地模拟校验：手机号 11 位；验证码 / 密码均为 123456；
 * 快捷登录点击即成功。接入真实后端时替换校验与 onLogin 参数即可。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { BottomSheetModal } from '@/components/ui/bottom-sheet-modal';
import { Spacing } from '@/constants/theme';
import { createDismissPan, useBottomSheet } from '@/hooks/use-bottom-sheet';
import { useTheme } from '@/hooks/use-theme';
import type { AuthProvider, User } from '@/hooks/use-auth';

/** 演示验证码 / 演示密码（本地模拟）。 */
const DEMO_CODE = '123456';

/** 面板固定高度（含表单 + 切换 + 快捷登录区）。 */
const LOGIN_HEIGHT = 372;

const COLOR_BLUE = '#0A84FF';
const COLOR_WECHAT = '#07C160';
const COLOR_QQ = '#12B7F5';

type LoginMode = 'code' | 'password';

type LoginSheetProps = {
  visible: boolean;
  /** 登录成功回调（携带用户信息）。 */
  onLogin: (user: User) => void;
  onClose: () => void;
};

export function LoginSheet({ visible, onLogin, onClose }: LoginSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<LoginMode>('code');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [countdown, setCountdown] = useState(0); // 获取验证码倒计时（秒）

  const height = useSharedValue(LOGIN_HEIGHT);
  const { translateY, backdropOpacity, open, close } = useBottomSheet({
    onClose,
    height,
    initialHeight: LOGIN_HEIGHT,
  });
  const pan = useMemo(
    () => createDismissPan({ translateY, backdropOpacity, height, onClose }),
    [translateY, backdropOpacity, height, onClose]
  );

  const prevVisibleRef = useRef(false);
  useEffect(() => {
    const isOpening = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!isOpening) return;
    open();
  }, [visible, open]);

  // 获取验证码倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  if (!visible) return null;

  const validPhone = /^1\d{10}$/.test(phone);

  /** 获取验证码（本地模拟：直接提示演示码）。 */
  const handleSendCode = () => {
    if (!validPhone) {
      Alert.alert('手机号不正确', '请输入 11 位手机号。');
      return;
    }
    setCountdown(60);
    Alert.alert('验证码已发送', `演示模式：验证码为 ${DEMO_CODE}`);
  };

  const finishLogin = (p: AuthProvider) => {
    const u: User =
      p === 'wechat'
        ? { phone: '', nickname: '微信用户', provider: 'wechat', loginAt: Date.now() }
        : p === 'qq'
          ? { phone: '', nickname: 'QQ 用户', provider: 'qq', loginAt: Date.now() }
          : {
              phone,
              nickname: `用户${phone.slice(-4)}`,
              provider: p,
              loginAt: Date.now(),
            };
    onLogin(u);
  };

  const handleSubmit = () => {
    if (!validPhone) {
      Alert.alert('手机号不正确', '请输入 11 位手机号。');
      return;
    }
    const expect = mode === 'code' ? code : password;
    if (expect !== DEMO_CODE) {
      Alert.alert(mode === 'code' ? '验证码错误' : '密码错误', `演示模式请输入 ${DEMO_CODE}`);
      return;
    }
    finishLogin(mode === 'code' ? 'phone' : 'password');
  };

  return (
    <BottomSheetModal
      onDismiss={close}
      pan={pan}
      translateY={translateY}
      backdropOpacity={backdropOpacity}
      height={height}
      bottomPadding={insets.bottom + Spacing.two}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          {/* 标题行 */}
          <View style={styles.header}>
            <ThemedText type="smallBold">{mode === 'code' ? '验证码登录' : '账号密码登录'}</ThemedText>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="关闭">
              <SymbolView name="xmark" size={16} tintColor={theme.textSecondary} />
            </Pressable>
          </View>

          {/* 手机号 */}
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="请输入手机号"
            placeholderTextColor={theme.textSecondary}
            keyboardType="phone-pad"
            maxLength={11}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />

          {/* 验证码 / 密码 行 */}
          <View style={styles.codeRow}>
            <TextInput
              value={mode === 'code' ? code : password}
              onChangeText={mode === 'code' ? setCode : setPassword}
              placeholder={mode === 'code' ? '请输入验证码' : '请输入密码'}
              placeholderTextColor={theme.textSecondary}
              keyboardType={mode === 'code' ? 'number-pad' : 'default'}
              secureTextEntry={mode === 'password'}
              maxLength={mode === 'code' ? 6 : undefined}
              style={[
                styles.input,
                styles.codeInput,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
            {mode === 'code' ? (
              <Pressable
                onPress={handleSendCode}
                disabled={countdown > 0 || !validPhone}
                hitSlop={4}
                style={[
                  styles.codeBtn,
                  { backgroundColor: COLOR_BLUE },
                  (countdown > 0 || !validPhone) && styles.disabled,
                ]}
                accessibilityLabel="获取验证码">
                <ThemedText type="smallBold" style={styles.actionText}>
                  {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                </ThemedText>
              </Pressable>
            ) : (
              <View style={styles.codeBtnPlaceholder} />
            )}
          </View>

          {/* 登录按钮 */}
          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: COLOR_BLUE },
              pressed && styles.pressed,
            ]}
            accessibilityLabel="登录">
            <ThemedText type="smallBold" style={styles.actionText}>
              登录
            </ThemedText>
          </Pressable>

          {/* 切换登录方式（小字） */}
          <Pressable
            onPress={() => setMode((m) => (m === 'code' ? 'password' : 'code'))}
            hitSlop={6}
            style={styles.switchRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {mode === 'code' ? '账号密码登录' : '验证码登录'}
            </ThemedText>
            <SymbolView name="chevron.right" size={10} tintColor={theme.textSecondary} />
          </Pressable>

          {/* 其他登录方式 */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <ThemedText type="small" themeColor="textSecondary">
              其他登录方式
            </ThemedText>
            <View style={styles.divider} />
          </View>

          <View style={styles.socialRow}>
            <Pressable
              onPress={() => finishLogin('wechat')}
              style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
              accessibilityLabel="微信登录">
              <View style={[styles.socialIcon, { backgroundColor: COLOR_WECHAT }]}>
                <SymbolView name="message.fill" size={22} tintColor="#ffffff" />
              </View>
              <ThemedText type="small" themeColor="textSecondary">微信</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => finishLogin('qq')}
              style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
              accessibilityLabel="QQ 登录">
              <View style={[styles.socialIcon, { backgroundColor: COLOR_QQ }]}>
                <SymbolView name="bubble.left.fill" size={22} tintColor="#ffffff" />
              </View>
              <ThemedText type="small" themeColor="textSecondary">QQ</ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    height: 40,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
  codeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  codeInput: {
    flex: 1,
  },
  codeBtn: {
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  codeBtnPlaceholder: {
    minWidth: 96,
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    marginTop: Spacing.half,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginTop: Spacing.half,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(127, 127, 127, 0.4)',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.five,
    marginTop: Spacing.two,
  },
  socialBtn: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  socialIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
