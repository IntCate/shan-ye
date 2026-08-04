/**
 * 登录态 hook：本地模拟认证（MVP 无后端），登录信息持久化到 AsyncStorage。
 *
 * 登录方式：手机号+验证码（演示验证码 123456）/ 账号密码（演示密码 123456）/
 * 微信、QQ 快捷登录（演示直接成功）。后续接入真实后端时替换 login 内部实现即可。
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AuthProvider = 'phone' | 'password' | 'wechat' | 'qq';

export type User = {
  /** 登录手机号；微信/QQ 快捷登录为空串。 */
  phone: string;
  /** 显示昵称。 */
  nickname: string;
  provider: AuthProvider;
  loginAt: number;
};

const STORAGE_KEY = '@shanye/auth/user';

type UseAuthResult = {
  /** 当前登录用户；null = 未登录。 */
  user: User | null;
  /** 是否已完成本地登录态读取（避免启动时闪现未登录状态）。 */
  hydrated: boolean;
  login: (user: User) => void;
  logout: () => void;
};

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 启动时恢复本地登录态
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setUser(JSON.parse(raw) as User);
          } catch {
            // 数据损坏则视为未登录
          }
        }
      })
      .catch((e) => console.warn('[use-auth] 读取登录态失败', e))
      .finally(() => setHydrated(true));
  }, []);

  const login = useCallback((u: User) => {
    setUser(u);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u)).catch((e) =>
      console.warn('[use-auth] 保存登录态失败', e)
    );
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch((e) =>
      console.warn('[use-auth] 清除登录态失败', e)
    );
  }, []);

  return { user, hydrated, login, logout };
}

/** 手机号掩码：138****5678。 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
