# 坐标系专项修复记录（照片 / 搜索 / 路径）

- **日期**：2026-08-06
- **范围**：地图坐标系统一模型（中国区 Apple Maps 底图 = GCJ-02 网格）
- **基线**：Expo SDK 57 · React 19 · RN 0.86 · TypeScript strict · React Compiler 开启
- **验证方式**：`npx tsc --noEmit` 通过

## 一、问题现象

首页地图（react-native-maps / iOS Apple Maps）展示照片地理标记时：

- **卫星图（satellite / hybrid）：照片位置准确** ✓
- **标准图（standard）：照片位置偏移约 50~500 米** ✗

## 二、根因分析

### 坐标系模型（本次实测修正）

中国区 Apple Maps 基于高德数据，**底图（矢量道路与卫星影像）均为 GCJ-02 加密网格**，
MKMapView 按 GCJ-02 解释传入的 Marker/Polyline 坐标，**不会自动做 WGS-84 → GCJ-02 转换**。

代码原注释假设"矢量图模式（standard）由 Apple Maps 内部处理 WGS-84 → GCJ-02，无需手动转换"，
该假设被实测推翻：standard 模式下照片 WGS-84 原样传入，数值被按 GCJ-02 解释，
相对真实地物整体偏移 50~500 米。

### 各数据源坐标系与处理

| 数据源 | 坐标系 | 当前底图（GCJ-02）下正确做法 |
| ------ | ------ | ---------------------------- |
| 照片 EXIF GPS（`Asset.getLocation()`） | WGS-84（EXIF 规范强制） | **全部底图模式统一转 GCJ-02**（境外自动跳过） |
| Nominatim 搜索结果 | WGS-84 | 显示与定位前转 GCJ-02 |
| 国内 App 轨迹文件（两步路/六只脚等） | GCJ-02 | `raw` 原样即对齐 |
| 国外轨迹文件（Google Earth/Strava） | WGS-84 | 切 `toGcj02` 纠偏 |
| 本机录制轨迹（expo-location） | 国行设备返回 GCJ-02 / 境外 WGS-84 | `raw`（与底图同源，天然一致） |
| 长按标点（Placemark） | 取 MapView 坐标 = GCJ-02 网格值 | 原样保存/显示 |
| 定位蓝点 | 系统渲染，MapKit 内部对齐 | 无需处理 |

## 三、修改内容

| # | 文件 | 修改 |
| - | ---- | ---- |
| 1 | `src/app/index.tsx` | 照片 Marker：删除 `isSatellite` 条件分支，所有底图模式统一 `wgs84ToGcj02` 转换（依赖 mapType 的分支判断随注释一并移除） |
| 2 | `src/app/index.tsx` | 搜索结果：`handleSelectResult` 中 Nominatim WGS-84 坐标先转 GCJ-02，再 `setMarkers` 与 `moveMap` 定位 |
| 3 | `src/utils/coord-transform.ts` | 头部注释更新为正确坐标系模型（原注释误述"Apple Maps/Google Maps 底图用 WGS-84"） |
| 4 | `src/types/route.ts` | `CoordMode` 注释更新：`toGcj02` 为当前底图下主纠偏方向，`toWgs84` 仅当底图为 WGS-84 时适用（保留供扩展） |

### 照片修改（`src/app/index.tsx`）

```ts
// 照片 EXIF GPS 为 WGS-84。中国区 Apple Maps 底图（矢量与卫星影像）均为 GCJ-02 加密网格，
// MKMapView 按 GCJ-02 解释传入坐标且不自动转换，故所有底图模式都需手动 WGS-84 → GCJ-02
// 对齐底图（中国境外 wgs84ToGcj02 自动跳过，无副作用）。
const photoMarkers = useMemo(() => {
  if (!layers.photos) return [];
  return photos.map((p) => withConvertedCoords(p, wgs84ToGcj02));
}, [photos, layers.photos]);
```

### 搜索修改（`src/app/index.tsx`）

```ts
const handleSelectResult = useCallback(
  (point: GeoPoint, title: string) => {
    const converted = withConvertedCoords(point, wgs84ToGcj02);
    setMarkers([{ ...converted, title }]);
    moveMap({ ...converted, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  },
  [moveMap]
);
```

## 四、一致性说明

- 转换统一走 `withConvertedCoords`（[coord-transform.ts](../src/utils/coord-transform.ts)），
  保留对象其余字段（elevation/time/uri 等）。
- `wgs84ToGcj02` 内置境外跳过（`outOfChina`），统一转换在境外场景无副作用。
- 路径 `coordMode` 循环（raw → toWgs84 → toGcj02 → raw）行为未变，
  仅澄清注释；`toWgs84` 保留是面向未来 WGS-84 底图（境外 / Google Maps）的扩展位。

## 五、遗留观察（未改动）

1. **Android 端**：react-native-maps 默认 Google Maps，中国大陆无法正常加载中国地图数据，
   本次结论针对 iOS Apple Maps；Android 在中国区若接入国内地图需另按对应 SDK 坐标体系处理。
2. **照片 EXIF 被国内 App 改写为 GCJ-02** 的边缘情况：EXIF 规范强制 WGS-84、主流相机遵守，
   暂不做照片级坐标模式（需要时可复用 `withConvertedCoords` + 全局开关）。
