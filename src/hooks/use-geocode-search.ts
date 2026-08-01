/**
 * 地址搜索状态机：debounce + 限流 + 防竞态。
 *
 * - 400ms debounce：输入停止后才发起请求
 * - 1000ms 限流：距上次请求不足 1s 则等待（满足 Nominatim 政策）
 * - AbortController：新请求发起时取消旧请求，避免闪现过期结果
 */

import { useEffect, useRef, useState } from 'react';

import { NOMINATIM_RATE_LIMIT_MS, SEARCH_DEBOUNCE_MS } from '@/constants/map';
import { GeocodeError, searchAddress } from '@/services/geocode';
import type { SearchResult } from '@/types/map';

export type GeocodeSearchState = {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  hasResults: boolean;
};

export function useGeocodeSearch(query: string): GeocodeSearchState {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastCallRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const rateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 本 effect 挂载代次，用于限流等待后校验是否仍属本次请求。 */
  const effectSeqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const seq = ++effectSeqRef.current;

    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      if (rateTimerRef.current) {
        clearTimeout(rateTimerRef.current);
        rateTimerRef.current = null;
      }
      return;
    }

    const timer = setTimeout(async () => {
      // 限流：距上次请求不足 1s 则补足等待；timer 挂到 rateTimerRef 以便 cleanup 取消
      const elapsed = Date.now() - lastCallRef.current;
      if (elapsed < NOMINATIM_RATE_LIMIT_MS) {
        await new Promise<void>((resolve) => {
          rateTimerRef.current = setTimeout(resolve, NOMINATIM_RATE_LIMIT_MS - elapsed);
        });
      }
      // 被取消 / 新请求已进来 → 本次 seq 过期，直接丢弃不更新 lastCall / 状态
      if (seq !== effectSeqRef.current) return;
      lastCallRef.current = Date.now();

      // 取消上一个进行中的请求
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoading(true);
      setError(null);
      try {
        const r = await searchAddress(q, ac.signal);
        if (seq === effectSeqRef.current) setResults(r);
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          // 被新请求取消，静默
          return;
        }
        if (seq !== effectSeqRef.current) return;
        if (e instanceof GeocodeError) {
          setError(e.message);
        } else {
          setError('搜索失败');
          console.warn('[use-geocode-search] unexpected error', e);
        }
        setResults([]);
      } finally {
        // 仅当本次请求仍是最新时才清 loading
        if (abortRef.current === ac && seq === effectSeqRef.current) {
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      if (rateTimerRef.current) {
        clearTimeout(rateTimerRef.current);
        rateTimerRef.current = null;
      }
    };
  }, [query]);

  return {
    results,
    loading,
    error,
    hasResults: results.length > 0,
  };
}
