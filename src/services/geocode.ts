/**
 * Nominatim (OpenStreetMap) 免费地理编码封装。
 *
 * 政策约束：最大 1 请求/秒，需提供有效 User-Agent。
 * - User-Agent 在 Android/Web 端 fetch 可生效；iOS 端 fetch 的 UA 会被 NSURLSession 覆盖，
 *   Nominatim 通常接受非空默认 UA，若被限流则上层 hook 会得到 'rate' 错误并提示用户。
 */

import { NOMINATIM_ENDPOINT, SEARCH_MAX_RESULTS } from '@/constants/map';
import type { SearchResult } from '@/types/map';

export type GeocodeErrorKind = 'network' | 'rate' | 'empty' | 'parse';

export class GeocodeError extends Error {
  constructor(public kind: GeocodeErrorKind, message: string) {
    super(message);
    this.name = 'GeocodeError';
  }
}

type NominatimItem = {
  lat: string;
  lon: string;
  display_name: string;
};

/**
 * 按地址字符串搜索地理坐标。
 *
 * @param query  地址文本
 * @param signal AbortSignal，用于取消请求（防竞态）
 */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const url =
    `${NOMINATIM_ENDPOINT}?format=jsonv2` +
    `&limit=${SEARCH_MAX_RESULTS}` +
    `&accept-language=zh-CN` +
    `&addressdetails=0` +
    `&q=${encodeURIComponent(q)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        // iOS 端会被系统覆盖，Android/Web 生效
        'User-Agent': 'Omni/1.0 (expo-maps-demo)',
      },
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new GeocodeError('network', `网络请求失败：${(e as Error).message}`);
  }

  if (res.status === 429) {
    throw new GeocodeError('rate', '搜索过于频繁，请稍后再试');
  }
  if (!res.ok) {
    throw new GeocodeError('network', `网络错误（${res.status}）`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    throw new GeocodeError('parse', `响应解析失败：${(e as Error).message}`);
  }

  if (!Array.isArray(data)) {
    throw new GeocodeError('parse', '响应格式非数组');
  }

  return (data as NominatimItem[])
    .map((d) => ({
      latitude: parseFloat(d.lat),
      longitude: parseFloat(d.lon),
      displayName: d.display_name,
    }))
    .filter((d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude));
}
