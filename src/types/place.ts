/**
 * 收藏地点：长按地图保存的坐标点。
 *
 * MVP 阶段为会话级内存存储（与路径数据一致，不引入持久化层）；
 * 后续如需重启保留，可接入 AsyncStorage/MMKV。
 */
export type Place = {
  /** 唯一标识。 */
  id: string;
  /** 地点名称（长按保存时默认「地点 N」，可编辑）。 */
  name: string;
  latitude: number;
  longitude: number;
  /** 收藏时间戳（ms）。 */
  createdAt: number;
};
