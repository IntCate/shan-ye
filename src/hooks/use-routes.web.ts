/**
 * 路径文件数据层 hook（Web 占位）。
 *
 * Web 端卫星地图为占位符（satellite-map.web.tsx），无需真实路径数据。
 * 返回空结果 + no-op 方法，签名与 native 版本一致，避免 Web 端引入原生模块
 * （expo-document-picker / expo-file-system）报错。
 * Metro 在 Web 平台优先解析 .web.ts，故首页 import 的 useRoutes 在 Web 端拿到本文件。
 *
 * 返回类型内联定义（不从 native 版本 import type），避免 Web 端 `./use-routes`
 * 解析到自身导致循环引用；与 use-geotagged-photos.web.ts 同模式。
 */

import type { Route } from '@/types/route';

export function useRoutes(): {
  routes: Route[];
  loading: boolean;
  error: string | null;
  importRoute: () => Promise<Route[] | null>;
  toggleRoute: (id: string) => void;
  cycleCoordMode: (id: string) => void;
  removeRoute: (id: string) => void;
  clearError: () => void;
} {
  return {
    routes: [],
    loading: false,
    error: null,
    importRoute: () => Promise.resolve(null),
    toggleRoute: () => {},
    cycleCoordMode: () => {},
    removeRoute: () => {},
    clearError: () => {},
  };
}
