/**
 * 媒体库相关共享常量（native）。
 *
 * 相册网格（usePhotoAlbum）与地图照片标记（useGeotaggedPhotos）共用同一分页大小，
 * 避免两处各自定义导致调整时漏改。
 */

/** 每页查询数量：3 列 × 20 行。 */
export const MEDIA_PAGE_SIZE = 60;
