# Omni

基于 [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) 构建的**卫星地图 + 照片地理标记**跨平台应用，支持 iOS、Android 与 Web。以地图为核心，将设备相册中的 EXIF 地理标记照片渲染为地图 Marker，并支持路径导入（KML/GPX）、地理编码搜索、设备朝向指示等功能。UI 采用**液态玻璃（Glassmorphism）**效果，iOS 26+ 使用系统原生 `UIVisualEffectView`（`expo-glass-effect`）。

> ⚠️ 工程约束：编写任何代码前，必须查阅 [Expo v57.0.0 版本文档](https://docs.expo.dev/versions/v57.0.0/)。

## 核心功能

| 功能 | 说明 |
| --- | --- |
| 🛰️ 卫星地图首页 | `react-native-maps` 卫星/混合图层，启动自动定位（失败回退天安门） |
| 📍 地理编码搜索 | Nominatim (OSM) 免费 API，debounce + 限流，结果落 Marker 并跳转 |
| 🖼️ 照片地理标记 | 读取设备相册 EXIF GPS，在地图渲染缩略图 Marker，点击弹出详情面板 |
| 🧭 设备朝向指示 | 磁力计真北 heading 驱动蓝点锥形指示（Web 端不可用自动降级） |
| 🗺️ 路径导入 | 支持 KML / GPX 文件导入，Polyline 渲染，多路径开关与坐标系切换 |
| 📱 相册浏览 | 仿 iOS 相册网格布局 + 全屏查看器（Web 端占位降级） |
| 🪟 液态玻璃 UI | 搜索框、悬浮按钮、浮动面板、详情底部 Sheet 统一玻璃质感 |

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | Expo `~57.0.9`、React Native `0.86.2`、React `19.2.3` |
| 路由 | Expo Router `~57.0.9`（文件路由 + `typedRoutes` + `reactCompiler` 实验特性） |
| 语言 | TypeScript `~6.0.3`（`strict: true`） |
| 地图 | `react-native-maps` `1.27.2`（iOS Apple Maps / Android Google Maps / Web 占位） |
| 定位 & 朝向 | `expo-location` `~57.0.7` + 磁力计真北 heading |
| 相册 & EXIF | `expo-media-library` `~57.0.3`（Android 需 `ACCESS_MEDIA_LOCATION`） |
| 路径解析 | `fast-xml-parser` 解析 KML/GPX，WGS-84 / GCJ-02 坐标系切换 |
| 地理编码 | Nominatim (OpenStreetMap) 免费端点，1 req/s 限流 |
| 动画 | `react-native-reanimated` `4.5.1` + `react-native-worklets` `0.10.1` |
| 液态玻璃 | `expo-glass-effect`（iOS 26+ 原生 UIVisualEffectView）+ `expo-blur` 降级 |
| UI | `@expo/ui`、`expo-image`、`expo-symbols`、`react-native-gesture-handler`、`react-native-svg` |
| 视频 | `expo-video` `~57.0.2`（相册视频缩略图） |
| Web | `react-native-web` `~0.21.0`，静态输出 |

## 项目结构

```
Omni/
├── app.json                 # Expo 配置（scheme、plugins、experiments）
├── tsconfig.json            # 路径别名 @/* → ./src/*，@/assets/* → ./assets/*
├── AGENTS.md                # 工程约束：写代码前必读 Expo v57 文档
├── assets/                  # 静态资源（图标、splash、tab 图标）
├── scripts/
│   └── reset-project.js     # 重置为空白脚手架
└── src/
    ├── app/                 # Expo Router 文件路由（约定：src/app 目录）
    │   ├── _layout.tsx      # 根布局：GestureHandlerRootView + ThemeProvider + AnimatedSplashOverlay + AppTabs
    │   ├── index.tsx        # Home 屏幕 → 卫星地图（搜索/图层/路径/照片/定位）
    │   └── explore.tsx      # Explore 屏幕 → 相册网格与查看器
    ├── components/          # UI 组件（.web.tsx 为 Web 平台特定版本）
    │   ├── satellite-map.tsx / .web.tsx      # 地图核心：Marker / Polyline / HeadingCone
    │   ├── map-search-bar.tsx                # 液态玻璃搜索框 + 地理编码
    │   ├── map-floating-button.tsx           # 右下角悬浮操作按钮（液态玻璃）
    │   ├── map-layer-menu.tsx                # 图层选择器（standard / satellite / hybrid 等）
    │   ├── route-manager-panel.tsx           # 路径管理浮层（导入/开关/删除）
    │   ├── photo-detail-sheet.tsx            # 照片详情底部 Sheet（Reanimated 动画）
    │   ├── heading-cone.tsx                  # 蓝点朝向半透明锥形（SVG）
    │   ├── bubble-tail.tsx                   # 通用气泡尾巴指示器
    │   ├── glass-panel.tsx                   # 液态玻璃容器（iOS 26+ GlassView / 其他 BlurView）
    │   ├── photo-album/                      # 相册模块
    │   │   ├── photo-album.tsx / .web.tsx    # 相册外壳 + 权限门控
    │   │   ├── photo-grid.tsx                # 网格布局
    │   │   ├── photo-thumb-cell.tsx          # 缩略图单元格
    │   │   ├── video-thumb-cell.tsx          # 视频缩略图
    │   │   └── photo-viewer.tsx              # 全屏查看器（手势）
    │   ├── app-tabs.tsx / .web.tsx           # 原生 NativeTabs / Web Tabs
    │   ├── animated-icon.tsx / .web.tsx      # 启动动画与图标
    │   ├── themed-text.tsx                   # 主题化文本
    │   ├── themed-view.tsx                   # 主题化容器
    │   ├── hint-row.tsx                      # 提示行
    │   ├── web-badge.tsx                     # Web 端版本徽标
    │   ├── external-link.tsx                 # 应用内浏览器外链
    │   └── ui/collapsible.tsx                # 可折叠面板
    ├── hooks/
    │   ├── use-location.ts                   # 定位请求与首帧对齐缓存
    │   ├── use-heading.ts                    # 磁力计真北朝向
    │   ├── use-geotagged-photos.ts / .web.ts # 相册 EXIF GPS 提取
    │   ├── use-photo-album.ts                # 相册资源加载与分类
    │   ├── use-geocode-search.ts             # Nominatim 搜索（debounce + 限流）
    │   ├── use-routes.ts / .web.ts           # KML/GPX 导入 + 坐标系切换
    │   ├── use-color-scheme.ts / .web.ts     # 颜色方案（Web 支持水合）
    │   └── use-theme.ts                      # 主题色取用
    ├── services/
    │   └── geocode.ts                        # Nominatim API 封装（限流缓存）
    ├── types/
    │   ├── map.ts                            # 地图相关类型（Marker / Region / Handle）
    │   ├── geotagged-photo.ts                # EXIF 地理标记照片类型
    │   ├── photo-album.ts                    # 相册资源类型
    │   └── route.ts                          # KML/GPX 路径类型
    ├── utils/
    │   ├── coord-transform.ts                # WGS-84 ⇄ GCJ-02 坐标转换（中国境外 passthrough）
    │   └── route-parser.ts                   # KML/GPX → Polyline 路径解析
    ├── constants/
    │   ├── theme.ts                          # Colors / Fonts / Spacing / Glass / 布局常量
    │   └── map.ts                            # INITIAL_REGION / Nominatim / 搜索常量
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
| `npm run reset-project` | 将现有代码移至 `example/` 并生成空白 `src/app` 脚手架 |

## 核心架构

### 路由

采用 Expo Router 文件路由，约定路由文件位于 `src/app/`。根布局 [_layout.tsx](src/app/_layout.tsx) 注入 `GestureHandlerRootView`（手势支持）、`ThemeProvider`（明暗主题）、`AnimatedSplashOverlay`（启动过渡）并渲染 `AppTabs`。

- [src/app/index.tsx](src/app/index.tsx) — 卫星地图屏幕：搜索框、图层选择器、路径管理、照片 Marker、定位按钮、长按坐标浮动卡片
- [src/app/explore.tsx](src/app/explore.tsx) — 相册屏幕：权限门控 → 网格布局 → 全屏查看器

### 卫星地图（首页核心）

[satellite-map.tsx](src/components/satellite-map.tsx) 封装 `react-native-maps`：

- **启动定位流程**：`use-location` → loading 遮罩「正在定位…」→ 成功直接渲染当前位置（无跳转）/ 失败回退 `INITIAL_REGION`（天安门）
- **蓝点首帧对齐**：`onUserLocationChange` 首次回调时以 `duration=0` 修正中心点，避免「请求快照 vs 系统蓝点」两源漂移
- **Marker 分类**：搜索结果大头针 / EXIF 照片缩略图（长按进入列表模式）
- **坐标转换**：卫星/混合模式下 EXIF WGS-84 手动转 GCJ-02 对齐底图；矢量模式由 Apple Maps 内部处理
- **所有编程移动统一走 `moveMap()`**：自动清除浮动卡片（像素坐标随移动失效）与浮层，避免竞态

### 照片地理标记

`use-geotagged-photos` → `expo-media-library` 读取设备相册含 EXIF GPS 的资源：

- iOS：直接通过 `Asset.getLocationAsync()` 获取
- Android：需 `ACCESS_MEDIA_LOCATION` 权限（Android API 29+ 自动降级）
- 地图渲染：`photoMarkers` 以缩略图 + 圆角边框呈现，点击触发 `PhotoDetailSheet` 底部滑出面板

### 路径导入（KML / GPX）

`use-routes` + `route-parser.ts` 支持：

- `expo-document-picker` 选择 `.kml` / `.gpx` 文件
- `fast-xml-parser` 解析 `<coordinates>` / `<trkpt>` / `<rtept>`
- Polyline 渲染 + 多路径独立开关（toggle）
- 坐标系循环切换（Auto / WGS-84 / GCJ-02），适配不同数据源
- 导入后自动 `moveMap` 定位至最后一条路线 bounding box

### 地理编码搜索

`use-geocode-search` + `services/geocode.ts`：

- Nominatim 免费端点：`https://nominatim.openstreetmap.org/search`
- `SEARCH_DEBOUNCE_MS = 400` debounce 输入 + `NOMINATIM_RATE_LIMIT_MS = 1000` 服务端限流（Osm 政策要求）
- 结果下拉列表（液态玻璃）→ 选择后 `moveMap` + 落搜索 Marker

### 设备朝向指示

`use-heading` 监听磁力计真北 heading：

- [heading-cone.tsx](src/components/heading-cone.tsx) 以 SVG 半透明锥形渲染在蓝点上方
- Web 端 `heading.available === false`，`SatelliteMap` 自动跳过渲染（降级无指示）

### 相册模块（Explore Tab）

[photo-album/](src/components/photo-album/)：

- `photo-album.tsx`：权限请求（`MEDIA_LIBRARY` / `ACCESS_MEDIA_LOCATION`）+ 拒绝状态降级
- `photo-grid.tsx`：按列数自适应网格，区分照片 / 视频缩略图单元格
- `photo-viewer.tsx`：全屏左右滑动 + 双击缩放 + Reanimated 进场动画（独立 `GestureHandlerRootView` 嵌套支持手势）
- Web 端：`photo-album.web.tsx` 占位页（Metro 自动解析）

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

- [app-tabs](src/components/app-tabs.tsx)：原生端用 `expo-router/unstable-native-tabs` 渲染系统原生标签栏；Web 端用 `expo-router/ui` 的 `Tabs` 渲染顶部导航条
- [satellite-map](src/components/satellite-map.web.tsx) / [use-geotagged-photos.web.ts](src/hooks/use-geotagged-photos.web.ts) / [use-routes.web.ts](src/hooks/use-routes.web.ts) / [use-color-scheme.web.ts](src/hooks/use-color-scheme.web.ts) / [photo-album.web.tsx](src/components/photo-album/photo-album.web.tsx)：Web 端降级占位
- [animated-icon](src/components/animated-icon.tsx)：原生端有启动 splash 过渡，Web 端无

### 主题系统

- [constants/theme.ts](src/constants/theme.ts) 集中定义 `Colors`（light/dark）、`Fonts`（按平台）、`Spacing`、`Glass`（overlayLight/overlayDark）、`BottomTabInset`、`MaxContentWidth`
- [use-theme.ts](src/hooks/use-theme.ts) 暴露 `useTheme()` 返回当前颜色方案对应的调色板
- [ThemedText](src/components/themed-text.tsx) / [ThemedView](src/components/themed-view.tsx) 封装主题化基础组件，支持 `type` 变体与 `themeColor` 取色

### 布局约定

移动优先布局：使用 `react-native-safe-area-context` 的 `SafeAreaView` 处理安全区。**关键**：NativeTabs 将底部 Tab 栏高度计入子页面 `insets.bottom`，因此页面内底部元素只需 `insets.bottom + spacing`，无需额外加 Tab 高度。内容最大宽度 `MaxContentWidth = 800`，居中显示。

### 动画

- [animated-icon.tsx](src/components/animated-icon.tsx)：Reanimated `Keyframe`（**模块级声明避免重建**）实现启动 splash 过渡与图标入场动画
- [photo-detail-sheet.tsx](src/components/photo-detail-sheet.tsx)：`useAnimatedStyle` + `withTiming` 由 `photo` prop 变化触发（非 mount effect），确保每次打开动画正确运行
- `BubbleTail` + `HeadingCone`：`react-native-svg` 静态 + transform 定位

## 开发约定

- **写代码前必读** [Expo v57.0.0 文档](https://docs.expo.dev/versions/v57.0.0/)（见 [AGENTS.md](AGENTS.md)）
- TypeScript 严格模式，路径别名统一使用 `@/...`
- 平台特定代码使用 `.web.tsx` / `.web.ts` 扩展名分离
- 业务代码置于 `src/`，仅路由与布局文件置于 `src/app/`
- **统一地图移动入口**：所有编程式地图移动必须调用 `moveMap()`，自动清除浮动卡片与浮层
- **Reanimated Keyframe**：提升至模块级或 `useMemo`，避免每次 render 重建
- **React Compiler 互斥**：卫星地图文件首行 `"use no memo"` 防止 reactCompiler 破坏地图渲染
- **玻璃面板按压反馈**：禁止 `opacity` 动画（会破坏 UIVisualEffectView），改用 `scale` transform
- Web 预览推荐使用 Chrome DevTools 设备模式（iPhone 17 Pro，竖屏）

## 故障排查

| 问题 | 解决方案 |
| --- | --- |
| Expo Go 在 iOS 模拟器闪退 | 改用开发构建 `npm run ios`，JSI 库不兼容 Expo Go |
| `pod install` 失败 | `rm -rf ios/` 后重新 `npm run ios` |
| hermes-ios 下载缓慢 | `ENTERPRISE_REPOSITORY=阿里云镜像 npm run ios` |
| Metro 无法连接模拟器 | `xcrun simctl openurl booted exp+omni://` |
| iOS 真机安装后白屏 / 连不上 Metro | Xcode Run 不注入 Metro URL，改用 `expo run:ios --device` 或安装 `expo-dev-client` 扫码 |
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
