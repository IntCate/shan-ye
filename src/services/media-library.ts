/**
 * 媒体库数据层共享服务（native）。
 *
 * SDK 57 的 Asset 同步属性只剩 id，其余均为异步 getter（uri/尺寸/类型/创建时间/位置等）。
 * 数据层 hook（相册网格、地图照片标记）需要把一批 Asset 并发物化为业务模型，并保证
 * 单条 asset 取值失败不影响整页——本文件的 materializeAssets 统一承载该模式，
 * 消除两个 hook 此前重复的 Promise.allSettled + 过滤样板。
 */

import type { Asset } from 'expo-media-library';

/** 默认每批并发物化的 Asset 数。过大会造成桥接请求突发（每张 getter 都是一次跨桥调用），
 *  分批串行能平滑吞吐；相册网格与地图标记共用。 */
const DEFAULT_BATCH_SIZE = 10;

/**
 * 批量物化 Asset：分批（batchSize）并发执行 project（异步 getter 组合），
 * 返回成功且非 null 的结果。单条失败在 project 内部自行 catch（可记日志），不会中断整批。
 */
export async function materializeAssets<T>(
  assets: Asset[],
  project: (asset: Asset) => Promise<T | null>,
  batchSize = DEFAULT_BATCH_SIZE
): Promise<Awaited<T>[]> {
  const results: Awaited<T>[] = [];
  for (let i = 0; i < assets.length; i += batchSize) {
    const batch = assets.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(project));
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value !== null) {
        results.push(s.value);
      }
    }
  }
  return results;
}
