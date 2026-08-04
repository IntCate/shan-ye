# 山也

基于 [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) 构建的**卫星地图 + 照片地理标记**跨平台应用，支持 iOS、Android 与 Web。以地图为核心，将设备相册中的 EXIF 地理标记照片渲染为地图 Marker（视口内自动聚类为簇），并支持路径导入（KML/GPX/KMZ）、轨迹录制、地标收藏、海拔测速、地理编码搜索、设备朝向指示等功能。UI 采用**液态玻璃（Glassmorphism）**效果，iOS 26+ 使用系统原生 `UIVisualEffectView`（`expo-glass-effect`）。

> ⚠️ 工程约束：编写任何代码前，必须查阅 [Expo v57.0.0 版本文档](https://docs.expo.dev/versions/v57.0.0/)。

## 核心功能

| 功能 | 说明 |
| --- | --- |
| 🛰️ 卫星地图首页 | `react-native-maps` 卫星/混合图层，启动自动定位（失败回退天安门），无底部 Tab，改为**底部搜索框** + 右侧悬浮按钮组 |
| 📍 地理编码搜索 | Nominatim (OSM) 免费 API，debounce + 限流，结果落 Marker 并跳转（占位「查找地点与地址、图片、轨迹」） |
| 🖼️ 照片地理标记 | 读取设备相册 EXIF GPS，地图渲染缩略图 Marker；视口内像素网格**聚类为簇**（首图缩略图 + 数量徽标），点击放大展开 |
| 🧭 设备朝向指示 | 磁力计真北 heading 驱动蓝点锥形指示（Web 端不可用自动降级） |
| 🗺️ 路径导入 | 支持 KML / GPX / **KMZ** 文件导入（KMZ 为 ZIP 压缩 KML，`fflate` 解压），Polyline 渲染，多路径开关/重命名/删除与坐标系切换 |
| 📸 拍照 | 系统相机拍摄并自动保存到相册，相册监听增量更新地图照片标记 |
| 🎨 轨迹录制 | 开始/暂停/继续/结束状态机，统计里程/耗时/海拔，结束后保存为正式路线 |
| ⛰️ 海拔测速 | 实时海拔监测 + 最近 60s 迷你折线与最高/最低值 |
| ⭐ 地标收藏 | 长按地图保存坐标标点（橙色圆点 Marker），「我的」面板管理（定位/删除） |
| 👤 登录 | 本地模拟认证（手机号+验证码 / 密码 / 微信、QQ），AsyncStorage 持久化，演示验证码/密码 `123456` |
| 🖼️ 相册浏览 | 原 explore Tab 迁入「我的」面板：权限门控 + 网格布局 + 全屏查看器（Web 端占位降级） |
| 🪟 液态玻璃 UI | 搜索框、悬浮按钮、浮动面板、底部 Sheet、个人中心统一玻璃质感 |

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | Expo `~57.0.9`、React Native `0.86.2`、React `19.2.3` |
| 路由 | Expo Router `~57.0.9`（文件路由 + `typedRoutes` + `reactCompiler` 实验特性） |
| 语言 | TypeScript `~6.0.3`（`strict: true`） |
| 地图 | `react-native-maps` `1.27.2`（iOS Apple Maps / Android Google Maps / Web 占位） |
| 定位 & 朝向 | `expo-location` `~57.0.7` + 磁力计真北 heading |
| 相册 & EXIF | `expo-media-library` `~57.0.3`（Android 需 `ACCESS_MEDIA_LOCATION`） |
| 相机 | `expo-image-picker` `~57.0.7`（拍照 + 保存相册） |
| 文件选择 | `expo-document-picker` `~57.0.1` + `expo-file-system` `~57.0.1` |
| 路径解析 | `fast-xml-parser` 解析 KML/GPX + `fflate` 解压 KMZ，WGS-84 / GCJ-02 坐标系切换 |
| 持久化 | `@react-native-async-storage/async-storage` `2.2.0`（登录态） |
| 地理编码 | Nominatim (OpenStreetMap) 免费端点，1 req/s 限流 |
| 动画 | `react-native-reanimated` `4.5.1` + `react-native-worklets` `0.10.1` |
| 液态玻璃 | `expo-glass-effect`（iOS 26+ 原生 UIVisualEffectView）+ `expo-blur` 降级 |
| UI | `@expo/ui`、`expo-image`、`expo-symbols`、`react-native-gesture-handler`、`react-native-svg` |
| 视频 | `expo-video` `~57.0.2`（相册视频缩略图） |
| Web | `react-native-web` `~0.21.0`，静态输出 |

## 项目结构

```
shan-ye/
├── app.json                 # Expo 配置（scheme、plugins、permissions、experiments）
├── tsconfig.json            # 路径别名 @/* → ./src/*，@/assets/* → ./assets/*
├── AGENTS.md                # 工程约束：写代码前必读 Expo v57 文档
├── docs/                    # 迭代记录（code-review / optimization）
├── assets/                  # 静态资源（图标、splash、tab 图标）
└── src/
    ├── app/                 # Expo Router 文件路由（约定：src/app 目录）
    │   ├── _layout.tsx      # 根布局：GestureHandlerRootView + ThemeProvider + AnimatedSplashOverlay + Slot（无底部 Tab）
    │   └── index.tsx        # 首页（唯一路由）：卫星地图 + 底部搜索框 + 悬浮按钮组 + 各浮层面板
    ├── components/          # UI 组件（.web.tsx 为 Web 平台特定版本）
    │   ├── ui/
    │   │   └── bottom-sheet-modal.tsx        # 通用底部 Sheet Modal（遮罩/抓手/拖拽关闭）
    │   ├── photo-album/                      # 相册模块（「我的」面板内嵌）
    │   │   ├── photo-library.tsx / .web.tsx  # 相册外壳 + 权限门控
    │   │   ├── photo-grid.tsx                # 网格布局
    │   │   ├── photo-thumb-cell.tsx          # 照片缩略图单元格
    │   │   ├── video-thumb-cell.tsx          # 视频缩略图单元格
    │   │   └── photo-viewer.tsx              # 全屏查看器（左右滑动 + 双击缩放）
    │   ├── satellite-map.tsx / .web.tsx      # 地图核心：Marker / Polyline / HeadingCone / 照片簇
    │   ├── map-search-bar.tsx                # 底部液态玻璃搜索框
    │   ├── map-floating-button.tsx           # 悬浮操作按钮（液态玻璃）
    │   ├── map-layer-menu.tsx                # 图层多选器（路径/照片/标点显隐）
    │   ├── map-save-placemark-card.tsx       # 长按地图保存标点悬浮卡片
    │   ├── profile-sheet.tsx                 # 「我的」个人中心底部卡片（两段式收起/展开）
    │   ├── login-sheet.tsx                   # 登录二级面板
    │   ├── photo-detail-sheet.tsx            # 照片详情底部 Sheet（Reanimated 动画）
    │   ├── altitude-sheet.tsx                # 海拔高度测速面板
    │   ├── track-record-panel.tsx            # 轨迹录制面板
    │   ├── rename-route-sheet.tsx            # 路径重命名面板
    │   ├── heading-cone.tsx                  # 蓝点朝向半透明锥形（SVG 径向渐变）
    │   ├── bubble-tail.tsx                   # 通用气泡尾巴指示器
    │   ├── glass-panel.tsx                   # 液态玻璃容器（iOS 26+ GlassView / 其他 BlurView）
    │   ├── animated-icon.tsx / .web.tsx      # 启动动画与图标
    │   ├── themed-text.tsx                   # 主题化文本
    │   └── themed-view.tsx                   # 主题化容器
    ├── hooks/
    │   ├── use-location.ts                   # 定位请求与首帧对齐缓存
    │   ├── use-heading.ts                    # 磁力计真北朝向
    │   ├── use-geotagged-photos.ts / .web.ts # 地图照片 EXIF GPS 提取（≤300 张 + 视口裁剪）
    │   ├── use-photo-album.ts                # 相册资源加载与分类
    │   ├── use-media-count.ts / .web.ts      # 设备媒体总数（「我的」面板统计）
    │   ├── use-media-library-permission.ts   # 媒体库权限状态机（undetermined/denied/limited/granted）
    │   ├── use-geocode-search.ts             # Nominatim 搜索（debounce + 限流）
    │   ├── use-routes.ts / .web.ts           # KML/GPX/KMZ 导入 + 坐标系切换
    │   ├── use-track-recorder.ts             # 轨迹录制状态机（开始/暂停/继续/结束）
    │   ├── use-position-watch.ts             # GPS 订阅生命周期复用（权限/快照/订阅/清理）
    │   ├── use-altitude.ts                   # 海拔监测（实时值 + 60s 样本折线）
    │   ├── use-placemarks.ts                 # 收藏标点（会话级内存存储）
    │   ├── use-auth.ts                       # 本地模拟登录态（AsyncStorage 持久化）
    │   ├── use-bottom-sheet.ts               # 底部 Sheet 手势/动画编排（阈值/速度/吸附）
    │   ├── use-color-scheme.ts / .web.ts     # 颜色方案（Web 支持水合）
    │   └── use-theme.ts                      # 主题色取用
    ├── services/
    │   ├── geocode.ts                        # Nominatim API 封装（限流缓存）
    │   └── media-library.ts                  # Asset 批量物化（分批并发，单条失败不中断）
    ├── types/
    │   ├── map.ts                            # 地图类型（MapRegion / MapType / Handle）
    │   ├── geotagged-photo.ts                # EXIF 地理标记照片类型（含照片簇）
    │   ├── photo-album.ts                    # 相册资源类型
    │   ├── placemark.ts                      # 收藏标点类型
    │   └── route.ts                          # 路径类型（kml / gpx / kmz / record）
    ├── utils/
    │   ├── coord-transform.ts                # WGS-84 ⇄ GCJ-02 坐标转换（中国境外 passthrough）
    │   ├── route-parser.ts                   # KML/GPX/KMZ → Polyline 路径解析
    │   ├── cluster.ts                        # 照片像素网格聚类 + 视口裁剪
    │   └── geo.ts                            # 坐标格式化 / 大圆距离
    ├── constants/
    │   ├── theme.ts                          # Colors / Fonts / Spacing / Glass / 布局常量
    │   ├── map.ts                            # INITIAL_REGION / Nominatim / 搜索常量
    │   └── media.ts                          # 媒体分页常量
    └── global.css                            # Web 字体 CSS 变量
```

## 快速开始

### 环境要求

- Node.js（LTS）
- iOS 构建：macOS + Xcode + CocoaPods
- Android 构建：Android Studio + JDK

### 安装依赖

```bash
npm install
```

### ⚠️ 关于开发构建（重要）

本项目依赖 `react-native-worklets` 等 **JSI 库**，与 **Expo Go 不兼容**（会在 iOS 模拟器上闪退）。因此必须使用**开发构建（development build）**，而非 Expo Go：

```bash
# iOS 开发构建（首次或原生依赖变更时运行）
npm run ios          # 即 expo run:ios
```

国内网络环境下，CocoaPods 拉取原生依赖缓慢，建议使用阿里云镜像加速：

```bash
ENTERPRISE_REPOSITORY=阿里云镜像 npm run ios
```

> 经验：若 `pod install` 失败，可 `rm -rf ios/` 后重新执行 `npm run ios` 重建原生工程。

> ⚠️ 真机测试：Xcode Run 不会注入 Metro URL，需使用 `expo run:ios --device` 自动注入服务器地址；或安装 `expo-dev-client` 后手动扫码 / 输入地址。

### 日常开发

原生工程构建完成后，日常 JS 开发只需启动 Metro：

```bash
npm start          # 即 expo start
```

> 注意：CI 模式下 Metro 会禁用文件监听与自动重载；本地热重载开发请在独立终端执行 `npm start`。

**仅当新增/修改原生依赖时**才需要重新执行 `npm run ios` / `npm run android` 重建。

### 全部脚本

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动 Metro 开发服务器 |
| `npm run ios` | 构建并运行 iOS 开发版本（`expo run:ios`） |
| `npm run android` | 构建并运行 Android 开发版本（`expo run:android`） |
| `npm run web` | 启动 Web 开发服务器（`expo start --web`） |
| `npm run lint` | 运行 ESLint（`expo lint`） |

## 核心架构

### 路由

采用 Expo Router 文件路由，约定路由文件位于 `src/app/`。**已移除底部 Tab**：根布局 [_layout.tsx](src/app/_layout.tsx) 注入 `GestureHandlerRootView`（手势支持）、`ThemeProvider`（明暗主题）、`AnimatedSplashOverlay`（启动过渡），并以 `Slot` 直接渲染当前路由。

- [src/app/index.tsx](src/app/index.tsx) — 唯一的首页屏幕：卫星地图 + 底部搜索框（原 Tab 栏位置）+ 右侧悬浮按钮组 + 各浮层面板（我的 / 路径绘制 / 海拔 / 照片详情 / 保存标点）

### 卫星地图（首页核心）

[satellite-map.tsx](src/components/satellite-map.tsx) 封装 `react-native-maps`（首行 `"use no memo"` 防止 reactCompiler 破坏地图渲染）：

- **启动定位流程**：`use-location` → loading 遮罩「正在定位…」→ 成功直接渲染当前位置（无跳转）/ 失败回退 `INITIAL_REGION`（天安门）
- **蓝点首帧对齐**：`onUserLocationChange` 首次回调时以 `duration=0` 修正中心点，避免「请求快照 vs 系统蓝点」两源漂移
- **Marker 分类**：搜索结果大头针 / EXIF 照片缩略图与聚合簇（点击放大展开）/ 收藏标点橙色圆点
- **坐标转换**：卫星/混合模式下 EXIF WGS-84 手动转 GCJ-02 对齐底图；矢量模式由 Apple Maps 内部处理
- **性能设计**：高频更新源（heading / 蓝点）在组件内部持有；Marker/Polyline 提取为 `React.memo` 子组件；恒定对象（anchor/centerOffset）提升为模块级常量
- **所有编程移动统一走 `moveMap()`**：自动清除悬浮卡片（像素坐标随移动失效）与浮层，避免竞态

### 照片地理标记（聚类）

`use-geotagged-photos` → `expo-media-library` 读取设备相册含 EXIF GPS 的资源（上限 `MAX_PHOTOS = 300`，渐进式更新）：

- iOS：直接通过 `Asset.getLocationAsync()` 获取；Android：需 `ACCESS_MEDIA_LOCATION` 权限（API 29+ 自动降级）
- **聚类**：[cluster.ts](src/utils/cluster.ts) 以「视口中心为原点」做像素空间网格聚类（`CLUSTER_RADIUS_PX = 80`），同格照片聚为一簇（坐标取平均），同时承担**视口裁剪**（含 0.5 缓冲预渲染周边）
- **簇 Marker**：单张照片与簇共用同款样式（缩略图 + 白边 + 尾巴），簇叠加数量徽标（22pt 圆，>99 显示 99+），点击簇放大到包围盒逐步展开
- 图片源用 `asset.id`（`ph://`）按需加载系统缩略图，数据管线不提前 getUri

### 路径导入（KML / GPX / KMZ）

`use-routes` + [route-parser.ts](src/utils/route-parser.ts) 支持：

- `expo-document-picker` 选择 `.kml` / `.gpx` / `.kmz` 文件
- KMZ 为 ZIP 压缩的 KML：以二进制（arrayBuffer）读取后由 `fflate.unzipSync` 解压内部 `.kml`，再走 KML 解析
- `fast-xml-parser` 解析 `<coordinates>` / `<trkpt>` / `<rtept>`
- Polyline 渲染 + 多路径独立开关 / 重命名 / 删除
- 坐标系循环切换（Auto / WGS-84 / GCJ-02），适配不同数据源
- 颜色从 `ROUTE_COLORS` 调色板循环分配，互斥锁防连点并发导入
- 导入后自动 `moveMap` 定位至最后一条路线 bounding box
- **录制轨迹**（`format: 'record'`）：轨迹录制结束后由 `addRecordedRoute` 保存为正式路线

### 轨迹录制

`use-track-recorder` + `use-position-watch`（GPS 订阅生命周期复用）：

- 状态机：idle → recording（可暂停/结束）→ paused（可继续/结束）
- `watchPositionAsync` 高频订阅（1s / 2m），每次更新记录轨迹点（经纬度+海拔+时间戳），累计相邻点大圆距离作为总里程；暂停时移除订阅省电
- 录制中实时轨迹作为临时红色 Route 叠加显示，结束后转为正式路线
- 面板关闭不停止录制（hook 在页面持有），重新打开可查看进度

### 海拔测速

`use-altitude`（同样复用 `usePositionWatch`）：

- 状态机：idle → locating → active；denied（权限拒绝）/ error（定位异常）终态
- 持续订阅（1s）刷新实时海拔，保留最近 60 个样本绘制迷你折线并统计最高/最低值

### 地标收藏

`use-placemarks`（会话级内存存储）：

- 长按地图空白 → 红点 + `MapSavePlacemarkCard` 悬浮卡片（坐标 + 名称输入 + 收藏按钮）
- 地图上以橙色圆点 Marker 展示（24pt 透明点击区），点击弹 Callout 显示名称与坐标
- 「我的」面板标点列表：点击定位 / 删除

### 地理编码搜索

`use-geocode-search` + `services/geocode.ts`：

- Nominatim 免费端点：`https://nominatim.openstreetmap.org/search`
- `SEARCH_DEBOUNCE_MS = 400` debounce 输入 + `NOMINATIM_RATE_LIMIT_MS = 1000` 服务端限流（OSM 政策要求）
- 结果下拉列表（液态玻璃）→ 选择后 `moveMap` + 落搜索 Marker
- 搜索会话激活期间隐藏右侧悬浮按钮组（键盘避让上移会进入按钮组区域）

### 设备朝向指示

`use-heading` 监听磁力计真北 heading：

- [heading-cone.tsx](src/components/heading-cone.tsx) 以 SVG 半透明锥形渲染在蓝点上方（40° 顶角、SVG RadialGradient 4 段不透明度渐变）
- Web 端 `heading.available === false`，`SatelliteMap` 自动跳过渲染（降级无指示）

### 登录

`use-auth`（本地模拟认证，MVP 无后端）：

- 登录方式：手机号+验证码（演示验证码 `123456`）/ 账号密码（演示密码 `123456`）/ 微信、QQ 快捷登录（演示直接成功）
- 登录信息持久化到 AsyncStorage，启动时恢复本地登录态（`hydrated` 防未登录闪现）
- 后续接入真实后端时替换 `login` 内部实现即可

### 「我的」个人中心

[profile-sheet.tsx](src/components/profile-sheet.tsx) 是**两段式底部卡片**（收起/展开），与 PhotoDetailSheet 同源（复用 `useBottomSheet` + `BottomSheetModal`）：

- **收起态**：头像 + 昵称 + 统计数据（照片数/路径数/标点数），点击统计项直达对应列表
- **展开态**（内容随 section 动态切换）：
  - `map`：地图模式选择器（标准地图 / 卫星地图 / 天气地图，横向样图卡片，选中蓝边框）
  - `photos`：完整图库（原 explore Tab 迁入：设备相册照片/视频网格 + 查看器）
  - `routes`：路径管理（导入 / 显隐 / 坐标模式 / 重命名 / 删除 / 点击定位）
  - `placemarks`：收藏标点列表（点击定位 / 删除）
- 拖拽交互：上滑展开、下滑超过阈值回收、长拖或用力下甩直接关闭；translateY 模型实时计算收起态基准

### 相册模块（「我的」面板内嵌）

[photo-album/](src/components/photo-album/)：

- `photo-library.tsx`：权限门控（undetermined / denied / limited / granted 四态）+ limited 条幅 + 网格 + 查看器编排
- `photo-grid.tsx`：按列数自适应网格，区分照片 / 视频缩略图单元格
- `photo-viewer.tsx`：全屏左右滑动 + 双击缩放 + Reanimated 进场动画（独立 `GestureHandlerRootView` 嵌套支持手势）
- 数据层：`use-photo-album` + `services/media-library.ts` 的 `materializeAssets`（分批并发物化 Asset，单条失败不中断整批）
- Web 端：`photo-library.web.tsx` 占位页（Metro 自动解析）

### 液态玻璃 UI

`GlassPanel` + `BubbleTail` 统一视觉规范：

- **可用性检测**：`isLiquidGlassAvailable()`（iOS 26+）+ `isGlassEffectAPIAvailable()` 双检，避免透明 fallback 或 crash
- **iOS 26+**：`expo-glass-effect` 的 `GlassView`（`glassEffectStyle='regular'`），children 必须渲染在 `contentView` 内以启用系统亮度自适应（自动变白/图标变色）
- **其他平台**：`expo-blur` 的 `BlurView` + 半透明 overlay 降级
- **SF Symbol**：iOS 26+ 玻璃面板内不设 `tintColor` 由系统自适应；其他平台用 `theme.text` 保证可见
- **尾巴气泡**：`BubbleTail`（direction/color/size）使用 `Glass.overlayLight/Dark` 与玻璃面板 overlay 无缝衔接
- **按压反馈**：玻璃视图及其所有祖先 `opacity` 必须为 1，改用 scale transform 替代 opacity 动画

### 平台差异化

通过 `.web.tsx` 扩展名实现 Web 端差异化实现，Metro 自动按平台解析：

- [satellite-map.web.tsx](src/components/satellite-map.web.tsx) / [use-geotagged-photos.web.ts](src/hooks/use-geotagged-photos.web.ts) / [use-routes.web.ts](src/hooks/use-routes.web.ts) / [use-media-count.web.ts](src/hooks/use-media-count.web.ts) / [photo-library.web.tsx](src/components/photo-album/photo-library.web.tsx)：Web 端降级占位
- [animated-icon.web.tsx](src/components/animated-icon.web.tsx)：原生端有启动 splash 过渡，Web 端无

### 主题系统

- [constants/theme.ts](src/constants/theme.ts) 集中定义 `Colors`（light/dark）、`Fonts`（按平台）、`Spacing`、`Glass`（overlayLight/overlayDark）、`BottomTabInset`、`MaxContentWidth`
- [use-theme.ts](src/hooks/use-theme.ts) 暴露 `useTheme()` 返回当前颜色方案对应的调色板
- [ThemedText](src/components/themed-text.tsx) / [ThemedView](src/components/themed-view.tsx) 封装主题化基础组件，支持 `type` 变体与 `themeColor` 取色

### 布局约定

移动优先布局：使用 `react-native-safe-area-context` 的 `SafeAreaView` 处理安全区。**已移除底部 Tab**，`insets.bottom` 仅含 Home Indicator：

- 底部搜索框：`bottom = insets.bottom + Spacing.two`（原 Tab 栏位置）
- 右侧悬浮按钮组：`bottom = insets.bottom + BOTTOM_BAR_OFFSET`（72pt，置于搜索框上方）
- 内容最大宽度 `MaxContentWidth = 800`，居中显示

### 动画

- [animated-icon.tsx](src/components/animated-icon.tsx)：Reanimated `Keyframe`（**模块级声明避免重建**）实现启动 splash 过渡与图标入场动画
- [photo-detail-sheet.tsx](src/components/photo-detail-sheet.tsx)：`useAnimatedStyle` + `withTiming` 由 `photo` prop 变化触发（非 mount effect），确保每次打开动画正确运行
- [bottom-sheet-modal.tsx](src/components/ui/bottom-sheet-modal.tsx) + `use-bottom-sheet`：通用底部 Sheet 骨架（遮罩/抓手/拖拽/吸附），PhotoDetailSheet 与 ProfileSheet 复用同源
- `BubbleTail` + `HeadingCone`：`react-native-svg` 静态 + transform 定位

## 开发约定

- **写代码前必读** [Expo v57.0.0 文档](https://docs.expo.dev/versions/v57.0.0/)（见 [AGENTS.md](AGENTS.md)）
- TypeScript 严格模式，路径别名统一使用 `@/...`
- 平台特定代码使用 `.web.tsx` / `.web.ts` 扩展名分离
- 业务代码置于 `src/`，仅路由与布局文件置于 `src/app/`
- **统一地图移动入口**：所有编程式地图移动必须调用 `moveMap()`，自动清除浮动卡片与浮层
- **悬浮面板互斥**：我的 / 路径绘制 / 海拔 / 图层 打开时彼此关闭，避免多个浮层叠放
- **Reanimated Keyframe**：提升至模块级或 `useMemo`，避免每次 render 重建
- **React Compiler 互斥**：卫星地图文件首行 `"use no memo"` 防止 reactCompiler 破坏地图渲染
- **玻璃面板按压反馈**：禁止 `opacity` 动画（会破坏 UIVisualEffectView），改用 `scale` transform
- **媒体物化**：批量读取 Asset 异步属性统一走 `materializeAssets`（分批并发），单条失败自行 catch 不中断整批
- Web 预览推荐使用 Chrome DevTools 设备模式（iPhone 17 Pro，竖屏）

## 故障排查

| 问题 | 解决方案 |
| --- | --- |
| Expo Go 在 iOS 模拟器闪退 | 改用开发构建 `npm run ios`，JSI 库不兼容 Expo Go |
| `pod install` 失败 | `rm -rf ios/` 后重新 `npm run ios` |
| hermes-ios 下载缓慢 | `ENTERPRISE_REPOSITORY=阿里云镜像 npm run ios` |
| Metro 无法连接模拟器 | `xcrun simctl openurl booted exp+shanye://` |
| iOS 真机安装后白屏 / 连不上 Metro | Xcode Run 不注入 Metro URL，改用 `expo run:ios --device` 或安装 `expo-dev-client` 扫码 |
| Android 地图空白（无崩溃） | `app.json` 中 `androidGoogleMapsApiKey` 为占位符，替换为真实 Google Maps API key 后重建 |
| 照片 Marker 地图上偏移（卫星图） | EXIF GPS 为 WGS-84，卫星底图为 GCJ-02；已在 `photoMarkers` 内自动转换，如仍偏移检查 `mapType` 是否走卫星分支 |
| 玻璃面板透明/不显示 | 检查 `GlassPanel` 双检逻辑，或 iOS < 26 走 BlurView 降级；确认 `contentView` 内渲染 children |
| 底部详情 Sheet 手势不响应 | 确认 Sheet 内部嵌套了独立的 `GestureHandlerRootView`（Modal 手势需独立根） |
| 启动 splash 过渡异常 | 检查 `splashKeyframe` 是否模块级声明，若非则提升至文件顶层 |
| TypeScript 误删有效 imports | IDE TS Server 未索引新组件，重启 TS Server 或重载窗口 |

## 学习资源

- [Expo 文档](https://docs.expo.dev/)
- [Expo Router 文档](https://docs.expo.dev/router/introduction)
- [react-native-maps 文档](https://github.com/react-native-maps/react-native-maps)
- [Reanimated 文档](https://docs.swmansion.com/react-native-reanimated/)
- [Nominatim 政策](https://operations.osmfoundation.org/policies/nominatim/)

## License

见 [LICENSE](LICENSE)。
