/**
 * 设备媒体总数 hook（Web 占位）。
 *
 * 不 import expo-media-library（Web 无设备媒体库，会运行时报错）。
 * Metro 在 Web 平台优先解析 .web.ts，返回类型与 native 版本一致（恒为 0）。
 */

export function useMediaCount(): number {
  return 0;
}
