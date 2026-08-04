/**
 * 地理坐标格式化工具。
 */

/** 统一坐标展示格式：纬度 xx.xxxxxx° / 经度 xx.xxxxxx°（6 位小数）。
 *  首页浮动信息卡片与照片详情共用，避免各处各自 toFixed 造成格式漂移。 */
export function formatLatLng(latitude: number, longitude: number): { lat: string; lng: string } {
  return {
    lat: `纬度 ${latitude.toFixed(6)}°`,
    lng: `经度 ${longitude.toFixed(6)}°`,
  };
}

/** 两点间大圆距离（米），haversine 公式。轨迹里程累加用。 */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000; // 地球平均半径（米）
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
