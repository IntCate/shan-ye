"use no memo";
/**
 * 登录面板（BottomSheetModal 底部弹层）：
 *
 * 上半区三种登入方式，通过底部“验证码登入｜密码登入”文字切换：
 * - 一键登入（初始）：大圆角按钮「本机号码一键登入」，运营商模拟直接成功；
 * - 验证码登入：手机号 + 获取验证码 → 分格 OTP 验证码输入区（6 格创意样式）；
 * - 密码登入：手机号 + 密码。
 * 下半区（微信 / QQ 快捷登录）保持不变。
 *
 * 本地模拟校验：手机号 11 位；验证码 / 密码均为 123456；一键登入点击即成功。
 * 接入真实后端时替换校验与 onLogin 参数即可。
 *
 * 本文件使用 "use no memo"：含 sharedValue + Pan worklet，React Compiler 会干扰
 * shared value 与 worklet 的同步（见项目记录，与 profile-sheet/bottom-sheet-modal 同因）。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
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
import { Shadow, Spacing } from '@/constants/theme';
import { createDismissPan, useBottomSheet } from '@/hooks/use-bottom-sheet';
import { useTheme } from '@/hooks/use-theme';
import { maskPhone } from '@/hooks/use-auth';
import type { AuthProvider, User } from '@/hooks/use-auth';

/** 演示验证码 / 演示密码 / 演示本机号码（本地模拟）。 */
const DEMO_CODE = '123456';
const DEMO_PHONE = '13800001234';
/** 分格验证码位数。 */
const CODE_LENGTH = 6;

/** 面板固定高度（含上半区 + 切换 + 快捷登录区）：静态加高，键盘弹出时上半区内容（含密码面板两端切换行）不被遮挡。 */
const LOGIN_HEIGHT = 640;

const COLOR_BLUE = '#0A84FF';
const COLOR_WECHAT = '#07C160';
const COLOR_QQ = '#12B7F5';

type LoginMode = 'oneclick' | 'code' | 'password';
/** 验证码面板内部阶段：先手机号发码，再进入验证码输入。 */
type CodeStage = 'phone' | 'otp';

type LoginSheetProps = {
  visible: boolean;
  /** 登录成功回调（携带用户信息）。 */
  onLogin: (user: User) => void;
  onClose: () => void;
};

export function LoginSheet({ visible, onLogin, onClose }: LoginSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<LoginMode>('oneclick');
  const [codeStage, setCodeStage] = useState<CodeStage>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [countdown, setCountdown] = useState(0); // 获取验证码倒计时（秒）

  const otpRef = useRef<TextInput>(null);

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

  // 进入验证码输入阶段时聚焦（等待面板动画稳定后再弹键盘）
  useEffect(() => {
    if (mode !== 'code' || codeStage !== 'otp') return;
    const t = setTimeout(() => otpRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [mode, codeStage]);

  // 获取验证码倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  if (!visible) return null;

  const validPhone = /^1\d{10}$/.test(phone);

  /** 登录按钮可用条件：手机号有效，且验证码/密码已填写完整。 */
  const canSubmit =
    validPhone && (mode === 'code' ? code.length === CODE_LENGTH : password.length > 0);

  /** 切换上半区登入方式（验证码面板回到发码阶段）。 */
  const switchMode = (m: LoginMode) => {
    setMode(m);
    setCodeStage('phone');
  };

  /** 获取验证码 / 重发（本地模拟：直接提示演示码并进入 OTP 阶段）。 */
  const handleSendCode = () => {
    if (!validPhone) {
      Alert.alert('手机号不正确', '请输入 11 位手机号。');
      return;
    }
    setCodeStage('otp');
    setCountdown(60);
    Alert.alert('验证码已发送', `演示模式：验证码为 ${DEMO_CODE}`);
  };

  /** 本机号码一键登入（本地模拟：运营商识别直接成功）。 */
  const handleOneClick = () => {
    finishLogin('phone', DEMO_PHONE);
  };

  const finishLogin = (p: AuthProvider, phoneOverride = phone) => {
    const u: User =
      p === 'wechat'
        ? { phone: '', nickname: '微信用户', provider: 'wechat', loginAt: Date.now() }
        : p === 'qq'
          ? { phone: '', nickname: 'QQ 用户', provider: 'qq', loginAt: Date.now() }
          : {
              phone: phoneOverride,
              nickname: `用户${phoneOverride.slice(-4)}`,
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
    if (mode === 'code') {
      if (code.length !== CODE_LENGTH) {
        Alert.alert('验证码不完整', `请输入 ${CODE_LENGTH} 位验证码。`);
        return;
      }
      if (code !== DEMO_CODE) {
        Alert.alert('验证码错误', `演示模式请输入 ${DEMO_CODE}`);
        return;
      }
      finishLogin('phone');
      return;
    }
    if (password !== DEMO_CODE) {
      Alert.alert('密码错误', `演示模式请输入 ${DEMO_CODE}`);
      return;
    }
    finishLogin('password');
  };

  const handleOtpChange = (t: string) => {
    setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH));
  };

  return (
    <BottomSheetModal
      onDismiss={close}
      pan={pan}
      translateY={translateY}
      backdropOpacity={backdropOpacity}
      height={height}
      bottomPadding={insets.bottom + Spacing.two}>
      <Pressable style={styles.content} onPress={Keyboard.dismiss} accessibilityLabel="收起键盘">
          {/* 顶部仅保留关闭按钮 */}
          <View style={styles.headerClose}>
            <Pressable onPress={close} hitSlop={8} accessibilityLabel="关闭">
              <SymbolView name="xmark" size={16} tintColor={theme.textSecondary} />
            </Pressable>
          </View>

          {/* 上半主区：随登入方式变化（垂直居中） */}
          <View style={styles.main}>
            {mode === 'oneclick' ? (
              <>
                {/* 本机号码一键登入：大圆角按钮 */}
                <Pressable
                  onPress={handleOneClick}
                  style={({ pressed }) => [
                    styles.oneClickBtn,
                    Shadow.md,
                    { backgroundColor: COLOR_BLUE },
                    pressed && styles.pressed,
                  ]}
                  accessibilityLabel="本机号码一键登入">
                  <SymbolView name="phone.fill" size={18} tintColor="#ffffff" />
                  <ThemedText type="default" style={styles.actionText}>
                    本机号码一键登入
                  </ThemedText>
                </Pressable>
                <ThemedText type="small" themeColor="textSecondary" style={styles.oneClickHint}>
                  本机号码由运营商自动识别，无需手动输入
                </ThemedText>
              </>
            ) : mode === 'code' && codeStage === 'phone' ? (
              <>
                {/* 手机号 + 获取验证码 */}
                <View style={[styles.phoneRow, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" style={styles.phonePrefix}>
                    +86
                  </ThemedText>
                  <View style={styles.phoneDivider} />
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="请输入手机号"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="phone-pad"
                    maxLength={11}
                    style={[styles.phoneInput, { color: theme.text }]}
                  />
                </View>
                <Pressable
                  onPress={handleSendCode}
                  disabled={!validPhone}
                  style={[styles.sendBtn, { backgroundColor: COLOR_BLUE }, !validPhone && styles.disabled]}
                  accessibilityLabel="获取验证码">
                  <ThemedText type="smallBold" style={styles.actionText}>
                    获取验证码
                  </ThemedText>
                </Pressable>
              </>
            ) : mode === 'code' ? (
              <>
                {/* 验证码已发送提示 + 重发 */}
                <View style={styles.otpHintRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    验证码已发送至 {maskPhone(phone)}
                  </ThemedText>
                  <Pressable onPress={handleSendCode} disabled={countdown > 0} hitSlop={4}>
                    <ThemedText
                      type="smallBold"
                      style={countdown > 0 ? styles.otpResendDisabled : styles.otpResend}>
                      {countdown > 0 ? `${countdown}s 后重发` : '重新获取'}
                    </ThemedText>
                  </Pressable>
                </View>

                {/* 分格验证码输入区（点击任意格聚焦，激活格高亮） */}
                <Pressable style={styles.otpArea} onPress={() => otpRef.current?.focus()}>
                  {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                    const active = i === code.length;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.otpCell,
                          { backgroundColor: theme.backgroundElement },
                          active && styles.otpCellActive,
                        ]}>
                        <ThemedText type="default" style={[styles.otpDigit, { color: theme.text }]}>
                          {code[i] ?? ''}
                        </ThemedText>
                      </View>
                    );
                  })}
                  {/* 透明输入框：承载键盘输入，视觉由上方分格呈现 */}
                  <TextInput
                    ref={otpRef}
                    value={code}
                    onChangeText={handleOtpChange}
                    keyboardType="number-pad"
                    maxLength={CODE_LENGTH}
                    caretHidden
                    style={styles.otpInput}
                  />
                </Pressable>

                {/* 登录按钮 */}
                <Pressable
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  style={[
                    styles.submitBtn,
                    { backgroundColor: COLOR_BLUE },
                    !canSubmit && styles.disabled,
                  ]}
                  accessibilityLabel="登录">
                  <ThemedText type="smallBold" style={styles.actionText}>
                    登录
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                {/* 密码登入：手机号 + 密码 */}
                <View style={[styles.phoneRow, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" style={styles.phonePrefix}>
                    +86
                  </ThemedText>
                  <View style={styles.phoneDivider} />
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="请输入手机号"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="phone-pad"
                    maxLength={11}
                    style={[styles.phoneInput, { color: theme.text }]}
                  />
                </View>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="请输入密码"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  style={[
                    styles.pwdInput,
                    { color: theme.text, backgroundColor: theme.backgroundElement },
                  ]}
                />
                <Pressable
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  style={[
                    styles.submitBtn,
                    { backgroundColor: COLOR_BLUE },
                    !canSubmit && styles.disabled,
                  ]}
                  accessibilityLabel="登录">
                  <ThemedText type="smallBold" style={styles.actionText}>
                    登录
                  </ThemedText>
                </Pressable>
              </>
            )}

            {/* 切换登入方式：密码面板两端布局（左 验证码｜密码，右 找回密码）；其余面板居中（左入口 ｜ 一键登入） */}
            {mode === 'password' ? (
              <View style={styles.switchRowBetween}>
                <View style={styles.switchRowLeft}>
                  <Pressable onPress={() => switchMode('code')} hitSlop={6}>
                    <ThemedText type="small" themeColor="textSecondary">
                      验证码登入
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="small" themeColor="textSecondary">
                    ｜
                  </ThemedText>
                  <Pressable onPress={() => switchMode('oneclick')} hitSlop={6}>
                    <ThemedText type="small" themeColor="textSecondary">
                      一键登入
                    </ThemedText>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => Alert.alert('找回密码', `演示模式：密码为 ${DEMO_CODE}`)}
                  hitSlop={6}>
                  <ThemedText type="small" themeColor="textSecondary">
                    找回密码
                  </ThemedText>
                </Pressable>
              </View>
            ) : mode === 'oneclick' ? (
              <View style={styles.switchRow}>
                <Pressable onPress={() => switchMode('code')} hitSlop={6}>
                  <ThemedText type="small" themeColor="textSecondary">
                    验证码登入
                  </ThemedText>
                </Pressable>
                <ThemedText type="small" themeColor="textSecondary">
                  ｜
                </ThemedText>
                <Pressable onPress={() => switchMode('password')} hitSlop={6}>
                  <ThemedText type="small" themeColor="textSecondary">
                    密码登入
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={styles.switchRow}>
                <Pressable onPress={() => switchMode('password')} hitSlop={6}>
                  <ThemedText type="small" themeColor="textSecondary">
                    密码登入
                  </ThemedText>
                </Pressable>
                <ThemedText type="small" themeColor="textSecondary">
                  ｜
                </ThemedText>
                <Pressable onPress={() => switchMode('oneclick')} hitSlop={6}>
                  <ThemedText type="small" themeColor="textSecondary">
                    一键登入
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>

          {/* 下半区：其他登录方式（保持不变） */}
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
        </Pressable>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: Spacing.three,
    gap: 12,
  },
  headerClose: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  /** 上半主区：靠上紧凑排列，切换行紧随主控件之后。 */
  main: {
    flex: 1,
    gap: Spacing.three,
  },
  /** 本机号码一键登入：与搜索框一致的圆角按钮。 */
  oneClickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: Spacing.four,
  },
  oneClickHint: {
    textAlign: 'center',
  },
  /** 手机号输入容器（带 +86 前缀）。 */
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  phonePrefix: {
    fontWeight: '600',
  },
  phoneDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: 'rgba(127, 127, 127, 0.5)',
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
  },
  /** 获取验证码按钮。 */
  sendBtn: {
    height: 48,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  otpResend: {
    color: COLOR_BLUE,
  },
  otpResendDisabled: {
    color: 'rgba(127, 127, 127, 0.6)',
  },
  /** 分格验证码输入区。 */
  otpArea: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  otpCell: {
    width: 48,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(127, 127, 127, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellActive: {
    borderColor: COLOR_BLUE,
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
  },
  otpDigit: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  /** 透明输入框：覆盖在分格区之上承载键盘输入。 */
  otpInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0,
  },
  /** 密码输入框。 */
  pwdInput: {
    height: 48,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
  },
  submitBtn: {
    height: 48,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 切换登入方式（非密码面板）：居中「左入口 ｜ 一键登入」。 */
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  /** 切换登入方式（密码面板）：两端分布（左 验证码｜密码，右 找回密码）。 */
  switchRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  /** 禁用态：灰色半透明（获取验证码 / 登录按钮共用）。 */
  disabled: {
    backgroundColor: 'rgba(127, 127, 127, 0.55)',
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.7,
  },
  actionText: {
    color: '#ffffff',
  },
});
