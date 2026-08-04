/**
 * 媒体库权限 hook（native）。
 *
 * 统一相册三条数据管线（照片网格 / 地图照片标记 / 照片总数）与权限门控组件的
 * 权限获取与状态判断，避免各处重复调用 expo-media-library 的 usePermissions
 * 并各自判定 granted / limited。
 */

import { usePermissions } from 'expo-media-library';

/**
 * 注意：usePermissions() 默认（writeOnly=false）即请求「完整相册访问」——
 * iOS 弹窗由系统呈现，用户可选择「允许访问所有照片」或「选中的照片」（limited）。
 * limited 下仅用户勾选的资源可读：视频内容（AVPlayer 音轨/字幕轨）读取会报
 * Code=257 无权限警告，需用户升级为完整访问（iOS 17+ 再次 requestPermission
 * 弹升级框，或系统设置切换），详见 photo-library.tsx 的 limited 条幅。
 */
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
