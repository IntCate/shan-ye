import { useCallback, useRef, useState } from 'react';

import type { Place } from '@/types/place';

/** 生成简单唯一 id（时间戳 + 随机后缀）。 */
function makeId(): string {
  return `place-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 收藏地点（会话级内存存储）。
 *
 * 与 useRoutes 一致：MVP 阶段不引入持久化层，退出 App 后清空。
 * ref 镜像保证 add/remove 读到最新列表，避免闭包陈旧值。
 */
export function usePlaces(): {
  places: Place[];
  /** 保存新地点（长按地图入口）。 */
  addPlace: (name: string, latitude: number, longitude: number) => void;
  /** 删除地点（个人面板地点列表）。 */
  removePlace: (id: string) => void;
} {
  const [places, setPlaces] = useState<Place[]>([]);
  const placesRef = useRef<Place[]>([]);

  const commit = useCallback((next: Place[]) => {
    placesRef.current = next;
    setPlaces(next);
  }, []);

  const addPlace = useCallback(
    (name: string, latitude: number, longitude: number) => {
      commit([
        ...placesRef.current,
        { id: makeId(), name, latitude, longitude, createdAt: Date.now() },
      ]);
    },
    [commit],
  );

  const removePlace = useCallback(
    (id: string) => {
      commit(placesRef.current.filter((p) => p.id !== id));
    },
    [commit],
  );

  return { places, addPlace, removePlace };
}
