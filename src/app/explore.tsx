/**
 * Explore Tab：相册页面（仿 iOS 相册）。
 *
 * 仅作薄外壳，相册逻辑（权限门控、网格、查看器）封装在 PhotoAlbum 组件内。
 * PhotoAlbum 内部自管 safe-area；Web 端由 photo-album.web.tsx 占位（Metro 自动解析）。
 */

import { PhotoAlbum } from '@/components/photo-album/photo-album';

export default function TabTwoScreen() {
  return <PhotoAlbum />;
}
