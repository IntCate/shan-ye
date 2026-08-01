import type { MapRegion } from '@/types/map';

/** 首页初始视图：天安门。授权定位后可由定位按钮跳转到用户实际位置。 */
export const INITIAL_REGION: MapRegion = {
  latitude: 39.9087,
  longitude: 116.3975,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/** Nominatim (OpenStreetMap) 免费地理编码端点。 */
export const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/** Nominatim 政策要求：最大 1 请求/秒。 */
export const NOMINATIM_RATE_LIMIT_MS = 1000;

/** 搜索输入 debounce 时长（ms）。 */
export const SEARCH_DEBOUNCE_MS = 400;

/** 搜索结果最大条数。 */
export const SEARCH_MAX_RESULTS = 5;
