/**
 * 路径文件数据层 hook（native）。
 *
 * 通过 expo-document-picker 选择 KML/GPX/KMZ 文件，用 expo-file-system 读取内容，
 * 再经 route-parser 解析为 Route[]，供卫星地图以 Polyline 形式展示。
 * KMZ 是 ZIP 压缩的 KML，读取为二进制（arrayBuffer）后由 route-parser 内部解压。
 *
 * 设计要点：
 * - 会话级保留：routes 仅存于内存，退出 App 清空（MVP，不引入持久化存储）。
 * - routesRef 镜像：与 routes state 同步维护的 ref，供 importRoute 同步读取当前数量
 *   （setState updater 是异步执行的，不能在其中读取返回值；ref 避免闭包陈旧值）。
 * - 互斥锁 loadingRef：防止用户快速连点导入导致并发 DocumentPicker 与状态错乱
 *   （参照 use-geotagged-photos.ts 的 loadingRef 模式）。
 * - 颜色分配：parseRouteFile 接收 routesRef.current.length 作为 existingCount，
 *   从 ROUTE_COLORS 循环取色，确保多路线颜色不重复（超过 6 条后循环）。
 * - 错误处理：用户取消选择（canceled）不报错；读取/解析失败 setError 提示，
 *   console.error 记录详情，不吞异常。
 *
 * API（Expo SDK 57）：
 * - DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true }) → { canceled, assets }
 * - new File(uri).textSync()（expo-file-system 现代 File API，与 DocumentPicker 配套）
 * - new File(uri).arrayBuffer()（KMZ 二进制读取，返回 ArrayBuffer → Uint8Array）
 */

import { useCallback, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { parseRouteFile, ROUTE_COLORS } from '@/utils/route-parser';
import { gcj02ToWgs84, wgs84ToGcj02, withConvertedCoords } from '@/utils/coord-transform';
import type { CoordMode, Route, RoutePoint } from '@/types/route';

type UseRoutesResult = {
  routes: Route[];
  loading: boolean;
  error: string | null;
  /** 打开系统文档选择器，选择并解析 KML/GPX/KMZ 文件。返回本次导入的路线（取消/失败返回 null）。 */
  importRoute: () => Promise<Route[] | null>;
  /** 把应用内绘制的轨迹点保存为一条路线（format: 'record'），并入路径列表。 */
  addRecordedRoute: (points: RoutePoint[]) => void;
  /** 重命名某条路线（空名忽略）。 */
  renameRoute: (id: string, newName: string) => void;
  /** 切换某条路线的显隐。 */
  toggleRoute: (id: string) => void;
  /** 循环切换坐标模式：raw → toWgs84 → toGcj02 → raw，用于修正坐标系不匹配偏移。 */
  cycleCoordMode: (id: string) => void;
  /** 删除某条路线。 */
  removeRoute: (id: string) => void;
  /** 清除错误提示。 */
  clearError: () => void;
};

export function useRoutes(): UseRoutesResult {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // routes 的 ref 镜像：与 state 同步更新，供 importRoute 同步读取当前数量。
  // setState updater 异步执行，不能在其中通过闭包赋值取返回值；ref 解决此问题。
  const routesRef = useRef<Route[]>([]);
  // 互斥锁，防连点导入并发
  const loadingRef = useRef(false);

  /** 同步更新 ref 与 state，保证两者一致。 */
  const commit = useCallback((next: Route[]) => {
    routesRef.current = next;
    setRoutes(next);
  }, []);

  const importRoute = useCallback(async (): Promise<Route[] | null> => {
    if (loadingRef.current) return null;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // KML/GPX 在 iOS 上无通用 MIME type 映射（KML 的 UTType 为 com.google.earth.kml，
        // GPX 无标准 UTType），用 application/* 或 text/* 过滤会导致文件在选择器中灰色不可选。
        // 放宽为 '*/*' 允许所有文件，由 parseRouteFile 按扩展名校验并友好报错。
        type: '*/*',
        copyToCacheDirectory: true,
      });
      // 用户取消：不报错，静默返回
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      // 单文件导入（暂不支持 multiple，避免一次性大量解析阻塞）
      const asset = result.assets[0];
      const file = new File(asset.uri);
      // KMZ 是 ZIP 二进制文件，需读取为 ArrayBuffer 再转 Uint8Array 供解压器使用；
      // KML/GPX 是 UTF-8 文本，用 textSync 同步读取。
      const ext = asset.name.toLowerCase().split('.').pop() ?? '';
      const content: string | Uint8Array =
        ext === 'kmz'
          ? new Uint8Array(await file.arrayBuffer())
          : file.textSync();

      // 用 routesRef 同步读取当前数量供颜色分配，解析后立即提交
      const imported = parseRouteFile(asset.name, content, routesRef.current.length);
      commit([...routesRef.current, ...imported]);

      if (imported.length === 0) {
        setError(`未在「${asset.name}」中找到有效路径`);
      }
      return imported;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`导入失败：${msg}`);
      console.error('[use-routes] importRoute failed', e);
      return null;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [commit]);

  const toggleRoute = useCallback((id: string) => {
    commit(routesRef.current.map((r) => (r.id === id ? { ...r, visible: !r.visible } : r)));
  }, [commit]);

  const cycleCoordMode = useCallback((id: string) => {
    commit(
      routesRef.current.map((r) => {
        if (r.id !== id) return r;
        // 循环：raw → toWgs84 → toGcj02 → raw
        const nextMode: CoordMode =
          r.coordMode === 'raw' ? 'toWgs84' : r.coordMode === 'toWgs84' ? 'toGcj02' : 'raw';
        // 始终从 originalSegments 转换，避免来回切换累积精度损失
        const convert = nextMode === 'toWgs84' ? gcj02ToWgs84 : wgs84ToGcj02;
        const segments =
          nextMode === 'raw'
            ? r.originalSegments
            : r.originalSegments.map((seg) => ({
                points: seg.points.map((p) => withConvertedCoords(p, convert)),
              }));
        return { ...r, segments, coordMode: nextMode };
      })
    );
  }, [commit]);

  const removeRoute = useCallback((id: string) => {
    commit(routesRef.current.filter((r) => r.id !== id));
  }, [commit]);

  /** 重命名路线：去除首尾空格，空名忽略。 */
  const renameRoute = useCallback(
    (id: string, newName: string) => {
      const name = newName.trim();
      if (!name) return;
      commit(routesRef.current.map((r) => (r.id === id ? { ...r, name } : r)));
    },
    [commit]
  );

  /** 绘制轨迹保存为路线：单段、坐标模式 raw、颜色按已有数量循环分配。 */
  const addRecordedRoute = useCallback(
    (points: RoutePoint[]) => {
      const idx = routesRef.current.length;
      const route: Route = {
        id: `record-${Date.now()}`,
        name: `绘制轨迹 ${idx + 1}`,
        format: 'record',
        segments: [{ points }],
        originalSegments: [{ points }],
        visible: true,
        color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
        coordMode: 'raw',
        importedAt: Date.now(),
      };
      commit([...routesRef.current, route]);
    },
    [commit]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    routes,
    loading,
    error,
    importRoute,
    addRecordedRoute,
    renameRoute,
    toggleRoute,
    cycleCoordMode,
    removeRoute,
    clearError,
  };
}
