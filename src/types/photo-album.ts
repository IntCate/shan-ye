/**
 * 相册视图模型类型。
 *
 * expo-media-library SDK 57 的 Asset 同步属性只剩 id，uri/宽高/类型/时长全为异步 getter。
 * 本类型把查询结果的异步字段物化为同步字段，供网格与查看器直接渲染，避免渲染期 await。
 */

import type { Asset } from 'expo-media-library';
import type { MediaType } from 'expo-media-library';

/** 网格单元 / 查看器页共用的视图模型。 */
export type PhotoItem = {
  /** 原始 Asset 引用，查看器播放视频 / 未来删除等操作时用。 */
  asset: Asset;
  /** = asset.id，作为 FlatList key 与 Image 缓存键。 */
  id: string;
  /**
   * 渲染源。iOS：= id（ph:// localIdentifier，expo-image 原生按需加载系统缩略图，
   * 跳过 getUri 的 iCloud 下载/复制，与地图照片标记同款优化）；Android：getUri() 结果
   * （content://），其 id 为 MediaStore 数字 ID 不可直接渲染。
   */
  uri: string;
  /** 媒体类型（仅 IMAGE / VIDEO，查询已过滤）。 */
  mediaType: MediaType.IMAGE | MediaType.VIDEO;
  /** 像素宽。 */
  width: number;
  /** 像素高。 */
  height: number;
  /** 视频时长（毫秒），图片为 null。 */
  duration: number | null;
};

/** 屏幕坐标矩形（measureInWindow 结果），用于拖拽下滑返回缩略图动画的目标位置。 */
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
