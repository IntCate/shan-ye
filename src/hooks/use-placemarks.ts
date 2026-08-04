import { useCallback, useRef, useState } from 'react';

import type { Placemark } from '@/types/placemark';

/** 生成简单唯一 id（时间戳 + 随机后缀）。 */
function makeId(): string {
  return `placemark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 收藏标点（会话级内存存储）。
 *
 * 与 useRoutes 一致：MVP 阶段不引入持久化层，退出 App 后清空。
 * ref 镜像保证 add/remove 读到最新列表，避免闭包陈旧值。
 */
export function usePlacemarks(): {
  placemarks: Placemark[];
  /** 保存新标点（长按地图入口）。 */
  addPlacemark: (name: string, latitude: number, longitude: number) => void;
  /** 删除标点（个人面板标点列表）。 */
  removePlacemark: (id: string) => void;
} {
  const [placemarks, setPlacemarks] = useState<Placemark[]>([]);
  const placemarksRef = useRef<Placemark[]>([]);

  const commit = useCallback((next: Placemark[]) => {
    placemarksRef.current = next;
    setPlacemarks(next);
  }, []);

  const addPlacemark = useCallback(
    (name: string, latitude: number, longitude: number) => {
      commit([
        ...placemarksRef.current,
        { id: makeId(), name, latitude, longitude, createdAt: Date.now() },
      ]);
    },
    [commit],
  );

  const removePlacemark = useCallback(
    (id: string) => {
      commit(placemarksRef.current.filter((p) => p.id !== id));
    },
    [commit],
  );

  return { placemarks, addPlacemark, removePlacemark };
}
