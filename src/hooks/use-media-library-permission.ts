/**
 * 媒体库权限 hook（native）。
 *
 * 统一相册三条数据管线（照片网格 / 地图照片标记 / 照片总数）与权限门控组件的
 * 权限获取与状态判断，避免各处重复调用 expo-media-library 的 usePermissions
 * 并各自判定 granted / limited。
 */

import { usePermissions } from 'expo-media-library';

export function useMediaLibraryPermission() {
  const [permission, requestPermission] = usePermissions();
  return {
    /** 授权状态（'undetermined' | 'granted' | 'denied' | 'limited'...）。 */
    status: permission?.status ?? 'undetermined',
    /** 是否已授权（含 limited access）。 */
    granted: permission?.status === 'granted',
    /** 是否受限访问（仅部分照片可用）。 */
    limited: permission?.accessPrivileges === 'limited',
    /** 请求授权（系统弹窗）。 */
    requestPermission,
  };
}
