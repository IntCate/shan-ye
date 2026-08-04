# Omni 第二轮代码优化记录

- **优化日期**：2026-08-03
- **优化范围**：`src/` 全仓（冗余清理 / 公共组件抽取 / 性能重构 / 数据层合并 / 样式 token / 工具函数）
- **优化基线**：Expo SDK 57 · React 19 · RN 0.86 · TypeScript strict · React Compiler 开启
- **验证方式**：`npx tsc --noEmit` 全程通过；ESLint 挂起不可用，以 tsc + 人工 review 为准

## 一、优化总览

| # | 类别 | 优化项 | 涉及文件 | 收益 |
| - | ---- | ------ | -------- | ---- |
| 1 | 冗余清理 | 死代码清理（模板遗留 / 未用导入 / 占位按钮） | 删除 5 文件 + 2 空目录；重写 2 文件；修改 4 文件 | 消除维护噪音，降低误用风险 |
| 2 | 公共组件 | 抽公共 BottomSheet（hook + 骨架组件） | 新建 2 文件；重写 2 个 sheet | 消除约百行重复 Modal/手势/动画代码 |
| 3 | 性能 | H1 磁力计 10Hz 重渲染、H2 地图零 memo、H3 定位空转 | 重写 satellite-map.tsx、use-location.ts；修改 4 文件 | 消除 10Hz 整树重渲染，地图渲染隔离 |
| 4 | 数据层 | 相册三管线合并（常量 / 物化 / 权限） | 新建 3 文件；修改 4 文件 | 消除 3 处重复 allSettled 样板与权限判定 |
| 5 | 样式 | 阴影样式块 token 化 | 修改 theme.ts + 5 文件 | 6 处重复 shadow 块统一为 3 档 token |
| 6 | 工具 | `formatLatLng` 小函数统一 | 新建 1 文件；修改 2 文件 | 消除坐标展示格式漂移 |
| 7 | 核查 | 取色入口统一（P2 候选） | 无改动 | 确认 ROUTE_COLORS 已集中，无需处理 |
| 8 | 性能 | 照片与 EXIF 提取专项（数据管线瘦身 + Marker 渲染） | 修改 5 文件 | 消除 getUri 的 iCloud 下载/解码；Android Marker 停止视图追踪 |
| 9 | 性能 | 照片标记 JS 聚类 + 视口裁剪（阶段 2） | 新建 1 文件；修改 4 文件 | 密集照片聚合为簇；渲染量降到几十个 Marker |
| 10 | Bug 修复 | 个人信息面板收起态错配（张开不完全） | 修改 1 文件 | 收起态基准实时计算，任何时序下可见高度恒为 220 |
| 11 | 交互 | 展开态去除上滑交互（仅向下拖拽回收） | 修改 1 文件 | 展开态上滑交由内部列表滚动，Pan 不再抢占 |
| 12 | 交互 | 展开态下拉回收人性化（行程中点判定） | 修改 1 文件 | 消除「只拉一点就回收/滑过头直接关闭」 |
| 13 | Bug 修复 | 收起态上滑失效（手势配置未更新） | 修改 1 文件 | `"use no memo"` 保证 pan 手势对象重建 |
| 14 | UI / Bug | 照片面板底部留白修复 + 移除「没有更多照片」提示 | 修改 2 文件 | BottomSheetModal 安全区改为可选 prop，ProfileSheet 传 0 |
| 15 | 功能增强 | KMZ 路径文件导入支持 | 修改 3 文件 + 新增依赖 fflate | 支持 Google Earth 标准 .kmz 格式（ZIP 解压 + KML 解析） |
| 16 | 交互 / 视觉 | 搜索框 UI 优化（图标 + placeholder + 圆角） | 修改 1 文件 | 搜索图标 + placeholder 更新 + 圆角加大 |
| 17 | 视觉 | 悬浮按钮组间距加大 | 修改 1 文件 | 按钮间距 8pt → 16pt |
| 18 | UI 优化 | 照片聚合 Marker 样式统一 | 修改 1 文件 | 聚合簇用缩略图 + 数量徽标，与单张照片视觉一致 |
| 19 | 性能 / 交互 | 照片查看器滑动卡死重构（对齐 iOS Photos 联动机制） | 修改 1 文件 | 双向同步全改瞬时跳转，消除程序动画与 UIScrollView 冲突 |
| 20 | 视觉 | 画廊缩略图显示设计（当前项无框 / 非当前项竖长白线） | 修改 1 文件 | 非当前项 9:16 竖长方形左右白线夹住，当前项无框正方形 |
| 21 | UI | 隐藏主图列表横向滚动条 | 修改 1 文件 | 翻页不再显示横向滚动条 |
| 22 | 功能增强 | 个人信息面板增加「地点」（长按保存收藏坐标） | 新建 3 文件；修改 2 文件 | 长按恢复红点+坐标标点，悬浮卡片内置「添加/收藏/取消」三按钮，面板统计 + 列表管理与定位 |
| 23 | 功能增强 | 右侧按钮组增加「拍照」按钮 | 新增依赖 expo-image-picker；修改 2 文件 | 调用系统相机拍照并自动存入系统相册，地图照片标记增量出现 |
| 24 | 功能增强 | 路径绘制（轨迹录制） | 新建 2 文件；修改 5 文件 | 右侧按钮启动录制面板，统计里程/耗时/海拔，开始↔暂停/继续/结束，轨迹实时显示并保存为路线 |
| 25 | 功能增强 | 登入面板（本地模拟认证） | 新建 2 文件；修改 2 文件；新增依赖 @react-native-async-storage/async-storage | 手机号+验证码 / 账号密码可切换登录 + 微信/QQ 快捷入口，登录态持久化，个人面板顶部展示用户 |
| 26 | 问题修复 | 相册视频 AVPlayer 无权限警告（Code=257） | 修改 2 文件 | 相册视频缩略图触发系统音轨加载，limited 权限下无权限读取（Code=257 警告刷屏）；limited 条幅增加「开启完整访问」引导升级 |
| 27 | 交互 / 视觉 | 路径绘制面板按钮改版 | 修改 2 文件 | 三枚圆形按钮横排；中央主按钮「开始→拍照」，左侧按钮初始显示「暂停」 |
| 28 | 冗余清理 | 全仓冗余代码核查（迁移残留专项） | 修改 10 文件 | 清理未使用 Fonts/颜色/样式/参数/变量/export；视频防御性代码按决策保留 |
| 29 | 交互 / 视觉 | 路径列表放大 | 修改 1 文件 | 路径行高/字号/图标/色点放大，导入按钮图标与点击区域放大 |
| 30 | 功能增强 | 路径重命名 | 新增 1 文件 + 修改 3 文件 | 路径行铅笔按钮 + 重命名弹层，确定后列表与地图路线名称同步更新 |
| 31 | 问题修复 | 重命名面板键盘覆盖 | 修改 1 文件 | 键盘弹出时卡片高度动态增高（内容 + 键盘），内容始终在键盘上方 |
| 32 | 功能增强 | 海拔高度测速（实时海拔面板） | 新建 2 文件；修改 1 文件 | 右侧按钮组新增「海拔高度测速」按钮，弹出精美海拔面板：68pt 大数字实时刷新 + SVG 迷你折线 + 最低/最高海拔 |
| 33 | 复用重构 | 抽公共定位订阅 hook（usePositionWatch） | 新建 1 文件；重写 2 文件 | use-altitude 与 use-track-recorder 约 30 行重复的「权限/快照/订阅/清理」样板收敛为公共 hook |
| 34 | 问题修复 / 交互 | 搜索框键盘交互优化 | 修改 2 文件 | 键盘避让上移仅留 8pt 间距；点击地图外部收起搜索（失焦 + 隐藏结果） |
| 35 | 问题修复 / 交互 | 搜索框与按钮组遮挡互斥 | 修改 2 文件 | 聚焦搜索时隐藏右侧悬浮按钮组，消除键盘避让上移/结果列表与按钮组重叠遮挡 |
| 36 | 交互 | 取消聚焦清空搜索框 | 修改 1 文件 | 点地图收起搜索（dismiss）时清空已输入文字，下次聚焦从空白开始 |
| 37 | 功能增强 / 重命名 | 标点图层 + 地点→标点全量重命名 | 修改 5 文件；重命名 3 文件 | 图层菜单新增「标点」开关（地图上橙色圆点展示收藏标点）；个人面板「地点」改为「标点」；代码变量 Place→Placemark、usePlaces→usePlacemarks、MapSavePlaceCard→MapSavePlacemarkCard 等 |

## 二、优化详情

### 1. 死代码清理

**删除的文件**（均为模板遗留，`rg` 确认零引用）：
- `src/components/web-badge.tsx` — 模板遗留，零引用
- `src/components/ui/collapsible.tsx` — 模板遗留，零引用（连带删除空目录 `src/components/ui/`）
- `src/components/animated-icon.module.css` — 仅被死代码引用
- `assets/images/logo-glow.png` — 仅被死代码引用
- `scripts/reset-project.js` — 模板脚手架（连带删除空目录 `scripts/`，`package.json` 移除 `reset-project` 脚本）

**重写的文件**：
- `src/components/animated-icon.tsx`（148 → 74 行）：删除 `AnimatedIcon` 死导出及 `keyframe` / `logoKeyframe` / `glowKeyframe` / `INITIAL_SCALE_FACTOR`，仅保留 `AnimatedSplashOverlay`（`splashKeyframe` + expo-logo 淡出）
- `src/components/animated-icon.web.tsx`（108 → 3 行）：仅保留空实现 `export function AnimatedSplashOverlay() { return null; }`

**修改的文件**：
- `src/app/index.tsx`：删除「路径」占位按钮（`MapFloatingButton` + `onPress={() => {}}`）
- `src/components/map-search-bar.tsx`：清理迁移遗留的未使用 `useColorScheme` import
- `README.md`：清理 3 处失效引用

### 2. 抽公共 BottomSheet

两个底部弹层（照片详情、我的面板）此前几乎逐字重复 Modal + backdrop + tapArea + grabber + Pan 手势结构，抽为公共 hook + 骨架组件。

**新建**：
- `src/hooks/use-bottom-sheet.ts`：导出常量 `ANIM_DURATION=300`、`SNAP_DURATION=200`、`BACKDROP_OPACITY=0.5`、`DISMISS_THRESHOLD=80`、`DISMISS_VELOCITY=500`；`useBottomSheet({ onClose, height, initialHeight, restingOffset })` → `{ translateY, backdropOpacity, open, close }`（withTiming + runOnJS，onCloseRef 持有最新回调）；`createDismissPan({ translateY, backdropOpacity, height, onClose })` 纯关闭式拖拽手势（activeOffsetY(8) + 阈值/速度判定）
- `src/components/ui/bottom-sheet-modal.tsx`：`BottomSheetModal` 骨架组件（Modal + GestureHandlerRootView + backdrop + tapArea + grabber + GestureDetector），props 为 `{ onDismiss, pan, translateY, backdropOpacity, height }`

**改造**：
- `src/components/photo-detail-sheet.tsx`：重写为消费公共组件（`SHEET_HEIGHT = 360`、`prevPhotoRef` 检测打开）
- `src/components/profile-sheet.tsx`：删除本地 `handleClose` / `useAnimatedStyle` / Modal 结构及相关 import，统一公共常量（`DISMISS_THRESHOLD` 替代原 `DRAG_THRESHOLD`），保留 `COLLAPSED_HEIGHT` / `MAP_HEIGHT` / `LIST_HEIGHT` / `EXPANDED_OFFSET` 等业务常量

> 过程中修正：`react-native-gesture-handler` 导出的类型为 `PanGesture`（`GesturePan` 不存在），import 按 `import type { PanGesture }` 修正。

### 3. 性能重构 H1-H3

**H1 — 磁力计 10Hz 驱动整树重渲染**：
- 根因：`useHeading` 在 index.tsx 顶层调用，10Hz heading/accuracy 更新每次都 setState → 首页整树重渲染，而地图 0 memo 全部跟随重建
- `types/map.ts`：移除 `heading?: number | null` prop
- `satellite-map.tsx`：改用 `const heading = useHeading()` 内部持有，更新收敛在地图组件内
- `use-heading.ts`：setState 增加值相等短路（heading 与 accuracy 均未变则不新建 state）
- `index.tsx`：移除 `useHeading` import 与调用

**H2 — 卫星地图零 memo**：
- `satellite-map.tsx` 拆出 `SearchMarkers` / `PhotoMarkers` / `RoutePolylines` 三个 React.memo 子组件，Markers/Polylines 列表只在自身数据变化时重渲染
- `anchor={PHOTO_MARKER_ANCHOR}` / `centerOffset={PHOTO_MARKER_CENTER_OFFSET}` 提升为模块常量（`{ x: 0.5, y: 1 } as const` / `{ x: 0, y: -PHOTO_MARKER_TOTAL_HEIGHT / 2 } as const`）
- `handlePress` / `handleLongPress` / `handleUserLocationChange` 回调 useCallback 化
- 保留 `"use no memo"` 指令（文件第一行，React Compiler 地图渲染回归防护）
- `index.tsx`：`moveMap` / `handleSelectResult` / `handleMapLongPress` / `handleMapPress` / `handleRegionChange` / `handleLocate` / `handleUserLocationChange` 全部 useCallback 化；新增 `visibleRoutes = useMemo(() => (layers.routes ? routes : []), [layers.routes, routes])` 稳定引用，避免破坏 `RoutePolylines` memo

**H3 — 定位数据流空转**：
- 根因：`useLocation` 维护 coords/status/error state 并开启 `watchPositionAsync` 订阅，但 coords 无人消费（地图蓝点由系统 `showsUserLocation` 驱动），订阅空转且存在卸载竞态
- `use-location.ts` 重写为仅 `requestAndLocate`（纯命令式快照，`initialRegion` 兜底用），删除订阅与无人消费的 state

> 过程中修正：`GeoTaggedPhoto` 原误从 `types/map` 导入（该模块未导出），改为从 `@/types/geotagged-photo` 正确导入；并修复替换 `routes` prop 时误删 `onUserLocationChange` 的失误。

### 4. 相册三管线合并

三条数据管线（相册网格 / 地图照片标记 / 照片总数）此前各自重复定义分页大小、`Promise.allSettled` 物化样板与权限判定，统一收敛。

**新建**：
- `src/constants/media.ts`：`MEDIA_PAGE_SIZE = 60`（3 列 × 20 行）
- `src/services/media-library.ts`：`materializeAssets<T>(assets, project)` — 统一「并发物化 Asset 异步 getter + 单条失败不影响整页」模式
- `src/hooks/use-media-library-permission.ts`：`useMediaLibraryPermission()` → `{ status, granted, limited, requestPermission }`（undetermined/granted/denied/limited 统一判定）

**改造**：
- `use-photo-album.ts`：`PAGE_SIZE` → `MEDIA_PAGE_SIZE`，`Promise.allSettled` → `materializeAssets`（内层静默 catch 冗余，随 allSettled 兜底移除）
- `use-geotagged-photos.ts`：同上 + `usePermissions` → `useMediaLibraryPermission`（effect 判定改 `status === 'undetermined'`），保留 `console.warn` 记录 EXIF 异常（项目「不吞异常」规范）
- `use-media-count.ts`：`usePermissions` → `useMediaLibraryPermission`（取 `granted`）
- `photo-library.tsx`：`usePermissions` → `useMediaLibraryPermission`（`status` 三态渲染 + `limited` 条幅）

> 过程中修正：`Promise.allSettled` 会对 union 成员应用 `Awaited`，类型谓词需匹配 `PromiseFulfilledResult<Awaited<T> | null>`，返回类型相应为 `Promise<Awaited<T>[]>`。

### 5. 阴影样式块 token 化

6 处重复的 shadow 块（同色 `#000` / opacity 0.2，仅 radius/offset/elevation 不同）此前散落 5 个文件，归纳为 3 档：

- `src/constants/theme.ts` 新增 `Shadow.sm`（radius 2 / offset 0,1 / elevation 3）、`Shadow.md`（radius 6 / elevation 4）、`Shadow.lg`（radius 8 / elevation 6）
- `satellite-map.tsx`（照片 Marker 图）→ `Shadow.sm`
- `map-floating-button.tsx`（悬浮按钮）、`index.tsx`（长按信息卡片）→ `Shadow.md`
- `map-layer-menu.tsx`（图层菜单）、`map-search-bar.tsx`（输入框外层 + 结果卡）→ `Shadow.lg`

附带归并：搜索栏与图层菜单 elevation 统一为 6，浮层面板层级一致（iOS 视觉无变化，Android 阴影深度 4→6 属面板归一化）。

### 6. formatLatLng 工具函数

- 新建 `src/utils/geo.ts`：`formatLatLng(latitude, longitude)` → `{ lat, lng }`（`纬度 xx.xxxxxx°` / `经度 xx.xxxxxx°`，6 位小数）
- `index.tsx`（长按信息卡片 title/subtitle）、`photo-detail-sheet.tsx`（照片详情坐标行）改用，消除两处各自 `toFixed(6)` 的格式漂移

### 7. 取色入口统一（核查，无改动）

- 候选项「取色入口统一」经核查：`ROUTE_COLORS` 定义与循环取色逻辑（`colorIndex % ROUTE_COLORS.length`）已集中在 `src/utils/route-parser.ts`，无分散实现，无需处理。

### 8. 照片与 EXIF 提取专项（性能）

针对「地图照片地理标记」数据管线与渲染的性能专项，先做原生层核实再落地：

**核心事实（来自 expo-media-library 57 / expo-image 57 原生源码）**
- `Asset.getUri()`：iOS 走 `requestContentEditingInput`，`UriExtractor` 中 `isNetworkAccessAllowed = true` —— **触发 iCloud 下载 + 文件复制**，是数据管线最重操作
- `Asset.getLocation()`：iOS 直接读 `phAsset.location` 元数据 —— **不解码、不触发下载**，本身轻量
- expo-image 原生支持 `ph://`（PhotoLibraryAssetLoader），按容器尺寸计算 `targetSize` 请求**系统缩略图**（不加载原图），但同样 `isNetworkAccessAllowed = true`
- react-native-maps 1.27：`tracksViewChanges`（默认 true）仅 Android 有效（持续追踪自定义视图 = 性能杀手），iOS Apple Maps 忽略该 prop
- `AssetField` 枚举不支持 location 过滤 → 原生查询层无法做视口裁剪，只能物化后 JS 侧过滤

**改动**
- `src/types/geotagged-photo.ts`：移除 `uri` 字段（渲染改用 `id`，iOS 为 ph:// localIdentifier 直接作 expo-image source）
- `src/hooks/use-geotagged-photos.ts`：
  - 物化只读轻量元数据 `{id, creationTime, location}`，**去掉 `getUri`**（唯一触发下载/解码的调用）
  - `load` useCallback 化（稳定引用）
  - 新增 `addListener('mediaLibraryDidChange')` 媒体库变化增量刷新（卸载 remove 防泄漏）
- `src/services/media-library.ts`：`materializeAssets` 默认并发分批（10/批），替代 60 并发桥接突发（相册网格与地图标记共用）
- `src/components/satellite-map.tsx`：PhotoMarkers 缩略图 `source={{ uri: p.id }}`（ph:// 系统缩略图）；新增 `tracksViewChanges={!loaded}` —— 图片加载/失败前保持追踪（灰底占位 → 图片），onLoad/onError 后置 false 做最终快照停止追踪（Android）
- `src/components/photo-detail-sheet.tsx`：详情大图改用 `photo.id`（ph://，expo-image 按容器尺寸请求）

**收益**：数据管线从「每张 3 次桥接（含下载原图）」降为「每张 2 次轻量元数据读取」；无 GPS 照片不再白触发 uri 下载；Android Marker 停止持续视图追踪。

### 9. 照片标记 JS 聚类 + 视口裁剪（阶段 2）

阶段 1（数据管线瘦身 + ph:// 缩略图 + tracksViewChanges）真机验证通过后，落地 JS 聚类与视口裁剪：

**背景**：照片 Marker 是「图片 + 尾巴」自定义视图，原生渲染成本高于默认大头针。视口内照片密集（如某景区聚集数十张）会堆叠大量 Marker，视觉拥挤且浪费渲染。同时 `AssetField` 不支持 location 过滤，原生查询层无法做视口查询，只能在物化后 JS 侧过滤。

**新建** `src/utils/cluster.ts`：`clusterPhotos(photos, region, radiusPx)` 纯函数网格聚类
- 像素空间：以「视口中心为原点、delta 为尺度」归一化坐标，按屏幕像素半径（`PHOTO_CLUSTER_RADIUS_PX=80`）划分网格
- 同格照片聚为一簇（坐标取平均，`count` 徽标）；单张保留原样；`id` 由桶索引生成
- 视口裁剪：视口外（含 `VIEWPORT_BUFFER=0.5` 缓冲）的照片丢弃，只渲染可见区域附近
- O(n) 近似（相邻格对角距可能略超半径），数百张毫秒级完成，无需原生聚合库

**修改** `src/components/satellite-map.tsx`
- 内部新增 `viewport` state（`initialRegion` 初始化），`onRegionChangeComplete` 时更新并透传外层回调（`handleRegionChangeComplete`）
- `clustered = useMemo(() => clusterPhotos(photoMarkers, viewport), [photoMarkers, viewport])`，仅手势结束时重算
- `PhotoMarkers` 支持混合项渲染：单张照片（原缩略图 Marker，含 tracksViewChanges 加载期追踪）与照片簇（36px 圆形数量徽标 `rgba(0,122,255,0.92)` + 白字 + 白边，`tracksViewChanges={false}`，锚定中心）

**修改** `src/app/index.tsx`：新增 `handlePhotoClusterPress` —— 计算簇内照片包围盒（四周 20% 边距、0.005 最小 delta 兜底）→ `moveMap` 放大展开；`moveMap` 统一入口自动清浮层，符合既有规范

**修改** `src/types/geotagged-photo.ts` / `src/types/map.ts`：新增 `PhotoCluster` 类型与 `SatelliteMapProps.onClusterPress`

**修改** `src/hooks/use-geotagged-photos.ts`：`MAX_PHOTOS` 100 → 300（聚类 + 视口裁剪使渲染规模受控，可覆盖更广地理范围）

**交互流程**：密集照片 → 簇徽标 → 点击放大到包围盒 → 重新聚类逐步展开为单张照片 → 点击单张弹详情 sheet

### 10. 个人信息面板收起态错配修复（Bug）

**现象**：点击侧边「我的」按钮打开面板时，收起态**偶发张开不完全**——只显示顶部一小部分内容（如只到头像附近），而非完整的收起态（头像 + 昵称 + 统计，220px）。

**根因**：`profile-sheet.tsx` 中 `collapse()`、`pan.onUpdate()` 收起态分支、`pan.onEnd()` 收起态弹回三处使用**缓存值** `collapsedOffset` 作为收起态基准。该值只在 `expand()` 时被**立即**更新为 `targetHeight - COLLAPSED_HEIGHT`，而 `cardHeight` 是 300ms 动画值（`withTiming`）。两者不同步时，可见高度 = `cardHeight - translateY` ≠ `COLLAPSED_HEIGHT`：
- 展开动画中途触发回收：`cardHeight` 处于中间值，而基准已用新 `targetHeight` 计算 → 收起位错配
- 状态残留/时序竞争：缓存基准与 `cardHeight` 动画收尾不一致 → 可见高度小于 220px

**修复**（`src/components/profile-sheet.tsx`）：
- 收起态基准一律**实时计算** `cardHeight.value - COLLAPSED_HEIGHT`，不依赖缓存值：
  - `pan.onUpdate()` 收起态：`cardHeight.value - COLLAPSED_HEIGHT + e.translationY`
  - `pan.onEnd()` 收起态弹回：`withTiming(cardHeight.value - COLLAPSED_HEIGHT, ...)`
- `collapse()` 同时把 `cardHeight` 收尾到展开目标（新增 `targetHeightRef`，`expand()` 记录、opening effect 重置），`translateY` 停靠到 `target - COLLAPSED_HEIGHT`，两者同速动画——**任何时序下可见高度恒 = COLLAPSED_HEIGHT**，且不改变展开高度语义
- `collapsedOffset` 作为收起位基准的用途被上述实时计算取代；最终重构中该共享值已完全移除

**收益**：消除收起态基准错配竞态，收起态可见高度在开合/拖拽/动画中途打断等任何时序下恒等于 220px。

**补充修复（2026-08-04，终版）**：
**现象**：10 号修复后仍可稳定复现——只要打开过「照片」或「路径」面板（LIST_HEIGHT 展开），**二次打开**个人面板即出现收起态错配，可见高度远小于 220px（实测 ≈60px）。
**根因（真正）**：Reanimated **SharedValue 同帧「先写后读」拿到陈旧值**。opening effect 同帧先执行 `collapsedOffset.value = MAP_HEIGHT - COLLAPSED_HEIGHT`（260），紧接着调用 `open()`——而 `use-bottom-sheet.ts` 的 `open()` 内部读 `restingOffset.value`。同一帧内写入后立即读取，UI 线程仍返回**旧值**（照片/路径会话遗留的 LIST_HEIGHT 收起位 420），于是 `translateY` 动画停在 420，收起态可见高度 = 480 − 420 = **60px**。这也解释了：首次打开正常（初始 `collapsedOffset` 恰为 260，读旧值也正确）、仅打开照片/路径后才坏（遗留 420）；`cancelAnimation` 无效（根本不是残留动画，是陈旧读值）。
**修复（终版）**（`src/components/profile-sheet.tsx`）：
- `useBottomSheet` 不再传 `restingOffset`，也不再解构/调用 `open()`；删除 `collapsedOffset` 共享值声明
- opening effect 中收起位目标一律用**纯 JS 常量** `MAP_HEIGHT - COLLAPSED_HEIGHT` 直接 `withTiming`，不经过 sharedValue 读回：
  ```ts
  translateY.value = withTiming(MAP_HEIGHT - COLLAPSED_HEIGHT, { duration: ANIM_DURATION, easing: Easing.out(Easing.cubic) });
  backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: ANIM_DURATION });
  ```
- `expand()` 同步删除 `collapsedOffset` 维护（不再需要停靠位同步）
- 保留 `cancelAnimation` 四连 + 复位隐藏位（`translateY = MAP_HEIGHT`、`backdropOpacity = 0`），确保上一会话残留动画不影响本次开合；effect deps 收敛为 `[visible]`
- `use-bottom-sheet.ts` 的 `open()` 仍被 PhotoDetailSheet 使用，保持不动
**验证**：`npx tsc --noEmit` 通过。真机需**完整重载 App**（`"use no memo"` 是 babel 编译期指令，热更新不重新编译）后按复现流程验证：打开照片/路径面板 → 关闭 → 二次打开个人面板，收起态可见高度恒 = 220px。

### 11. 展开态去除上滑交互（交互优化）

**现象**：个人信息面板展开态「显示有上滑交互」——上滑手势会激活外层 Pan，干扰（抢占/吞掉）照片/路径列表内部 ScrollView/FlatList 的滚动。

**根因**：`profile-sheet.tsx` 的 pan 手势无 `activeOffsetY`，默认 slop 双向激活。展开态时上滑虽被 `Math.max(0, translationY)` 钳制（卡片不动），但手势仍激活并与内部列表滚动竞争，表现为「展开态有上滑交互」。

**修复**（`src/components/profile-sheet.tsx`）：
- 新增 `expanded` state（与 `expandedRef` 双轨：ref 供 worklet 实时判断，state 驱动手势重建）
- pan 手势按状态动态配置 `activeOffsetY`：
  - **展开态** `[Number.NEGATIVE_INFINITY, 10]`：仅向下移动激活 → 上滑交由内部列表滚动，Pan 不抢占，回收交互保留
  - **收起态** `[-10, 10]`：双向激活（上滑展开 / 下滑关闭），交互不变
- 展开态「向上钳制在 0」的 `Math.max` 保留为防御性兜底

**收益**：展开态上滑不再触发卡片交互，照片/路径列表滚动流畅；向下拖拽回收不受影响；收起态交互不变。

### 12. 展开态下拉回收人性化（交互优化）

**现象**：展开态下拉回收用固定 80px 阈值（`DISMISS_THRESHOLD`）——面板高度 480~640，行程占比过小，表现为「从展开态到收起态只能滑动一点」；且 500px/s 速度阈值过敏感，轻甩即回收，连续下拉容易「滑动过头直接关闭」。

**根因**：`profile-sheet.tsx` 展开态 `onEnd` 复用收起态的 `DISMISS_THRESHOLD(80) / DISMISS_VELOCITY(500)` 判定，未考虑展开行程（130~210px）远大于收起行程，阈值与行程不匹配。

**修复**（`src/components/profile-sheet.tsx`）：
- 展开态回收判定改为**行程中点**：`snapDown = (cardHeight.value - COLLAPSED_HEIGHT) / 2`（map≈130px / 列表≈210px，随面板高度自适应），下拉超过中点或快速下甩才回收，否则弹回展开态
- 新增 `COLLAPSING_VELOCITY = 800`：展开态下甩速度阈值放宽（收起态关闭仍用 `DISMISS_VELOCITY=500`），避免轻甩误触
- **语义约束**：展开态松手只决定「弹回 / 回收」，绝不直接关闭——关闭仅在收起态触发（80px + 500 速度），保留标准两段式关闭

**收益**：展开态下拉有充足行程空间与缓冲，不再「拉一点就回收」；松手最多落到收起态，不会因单次下拉直接关闭。

### 13. 收起态上滑失效修复（Bug，优化 #11 回归）

**现象**：从展开态下拉回收后，**再次上滑无任何反应**（面板纹丝不动）。打开面板后的首次上滑展开正常，仅「展开态→收起态→再次上滑」失效。

**根因**：优化 #11 引入动态 `activeOffsetY`（依赖 `expanded` state 切换展开/收起手势配置）后，项目开启的 **React Compiler** 自动 memo 化 `profile-sheet.tsx`，将 `pan` 手势对象缓存——`expanded` 变化后手势对象未重建，`activeOffsetY` 停留在展开态配置 `[-Infinity, 10]`（仅向下激活）。收起态上滑手势在原生层直接不激活（`activeOffsetYStart=-Infinity` 永不满足），表现为「上滑没反应」。#11 之前 pan 无 `activeOffsetY`（固定双向），手势缓存不影响激活，故无此问题。

**修复**（`src/components/profile-sheet.tsx` + `bottom-sheet-modal.tsx`）：
- 文件首行添加 `"use no memo"` 指令（与 `satellite-map.tsx` 解决 React Compiler 渲染问题的先例一致），禁用编译器自动 memo 化，保证每次渲染重建 `pan` 手势对象、`GestureDetector` 正确更新 `activeOffsetY` 配置。`bottom-sheet-modal.tsx`（含 GestureDetector 的中间层）同步添加
- 展开态 `activeOffsetY` 的 `-Infinity` 改为 `-100000`：`-Infinity` 在 JS→原生配置传递中可能被序列化异常（JSON 不支持 Infinity），导致手势配置错乱；`-100000` 为实际不可能达到的上滑位移，行为等价且传递安全

**验证要求**：`"use no memo"` 是 babel 编译期指令，**必须清缓存重启 Metro**（`npx expo start --clear`）才会重新编译生效——热更新可能沿用旧编译产物，导致修改看似无效。

**收益**：收起态上滑展开恢复正常；展开态仅向下激活（列表滚动流畅）不受影响。

### 14. 照片面板底部留白修复 + 移除「没有更多照片」提示（UI / Bug）

**现象**：个人面板「照片」展开态中，照片网格最后一行底部有 60~90pt 留白，一打开即存在。

**排查过程（含一次无效修改）**：
- 先疑 FlatList 视口未占满父容器，给 `photo-grid.tsx` 的 FlatList 加 `style={{ flex: 1 }}`——**无效**。原因：ScrollView 视口本来就受 flex 父容器约束（此前能滚动看到最后一行即为证据），`flex: 1` 只是显式化默认行为，已回退，避免冗余代码
- **真正根因**：`bottom-sheet-modal.tsx` 的卡片容器固定 `paddingBottom: insets.bottom + Spacing.one`（iPhone 约 38pt）。该安全区是为半屏卡片（照片详情面板）「背景色延伸至屏幕底边、无透明缝隙」设计的；而个人面板展开态是**全屏 Modal、底部无导航栏**，此 padding 落在 children（照片网格）下方，成为滚动到底后的底部留白

**修复**（`src/components/ui/bottom-sheet-modal.tsx` + `src/components/profile-sheet.tsx`）：
- `BottomSheetModal` 新增可选 prop `bottomPadding`（默认 `insets.bottom + Spacing.one`），PhotoDetailSheet 不传、行为不变
- `ProfileSheet` 传 `bottomPadding={0}`：照片容器占满「卡片高度 − 折叠态信息面板」剩余高度，滚动到底最后一行贴屏幕底（Home 指示条浮于其上，iOS 原生图库风格）
- 收起态不受影响（可见区为卡片顶部 220pt，不涉及底部 padding）

**附**（同轮 UI 调整）：`photo-grid.tsx` 移除 ListFooterComponent 中「没有更多照片」文字（仅保留加载中的 ActivityIndicator），同步清理 `hasMore` prop 与 `footerText` 样式（`usePhotoAlbum` 内部分页逻辑不受影响）。

**验证**：`npx tsc --noEmit` 通过；真机照片面板滚动到底无留白。

### 15. KMZ 路径文件导入支持（功能增强）

**背景**：项目此前仅支持 KML/GPX 两种路径文件格式。KMZ 是 Google Earth 的标准打包格式（ZIP 压缩的 KML），用户从 Google Earth 导出的路径文件通常为 `.kmz`，此前导入会抛出「不支持的文件格式」错误。

**实现**（`src/utils/route-parser.ts` + `src/hooks/use-routes.ts` + `src/types/route.ts` + 新增依赖 `fflate`）：
- 新增 `parseKmz(data: Uint8Array, ...)` 函数：用 `fflate.unzipSync`（纯 JS ZIP 解压器，无原生模块，~8KB）解压 KMZ 二进制 → 优先取 `doc.kml`（Google Earth 默认名），否则取第一个 `.kml` 文件 → `strFromU8` 转 UTF-8 文本 → 复用已有 `parseKml` 解析
- `parseRouteFile` 签名改为 `content: string | Uint8Array`，增加 `kmz` 扩展名分支
- `use-routes.ts` 检测 `.kmz` 扩展名时用 `file.arrayBuffer()` 读取二进制（expo-file-system File API），其余格式保持 `file.textSync()`
- `Route.format` 类型增加 `'kmz'`，解析后覆盖 `format` 与 id 前缀标识来源
- 错误提示更新为「仅支持 .kml / .gpx / .kmz」

**验证**：`npx tsc --noEmit` 通过。用户选择 `.kmz` 文件后自动解压内部 KML 并解析为 Polyline 渲染到地图。

### 16. 搜索框 UI 优化（交互 / 视觉）

**修改**（`src/components/map-search-bar.tsx`）：
- 输入框左侧新增 `magnifyingglass` SF Symbol 搜索图标（iOS 26 Liquid Glass 下不设 tintColor 由系统自适应，其他平台用 `textSecondary` 色）
- placeholder 改为「查找地点与地址、图片、轨迹」
- 圆角从 `Spacing.three`(16pt) 增至 `Spacing.four`(24pt)
- 布局调整为 `inputRow`（图标 + 输入框水平排列，`gap: 8`），输入框 `flex: 1` 撑满剩余宽度

### 17. 悬浮按钮组间距加大（视觉）

**修改**（`src/app/index.tsx`）：`floatingBtns` 容器 `gap` 从 `Spacing.two`(8pt) 增至 `Spacing.three`(16pt)，我的 / 图层 / 定位三个按钮间视觉呼吸感更舒适。

### 18. 照片聚合 Marker 样式统一（UI 优化）

**背景**：此前照片聚合簇用蓝色圆形数量徽标表示（36pt 圆点 + 白字数量），与单张照片 Marker（缩略图 + 白边 + 尾巴）视觉风格不一致，用户难以一眼识别为照片标记。

**修改**（`src/components/satellite-map.tsx`）：
- 聚合簇改用与单张照片完全相同的 Marker 样式：簇内第一张照片的缩略图（`item.photos[0].id`）+ 白边圆角方图 + 朝下尾巴
- 右下角叠加蓝色数量徽标（22pt 圆形，白边，系统蓝底白字，`position: absolute`），显示簇内照片数（>99 显示 99+）
- 锚点 / centerOffset / tracksViewChanges 逻辑与单张照片完全一致（视觉形状相同），删除不再需要的 `CLUSTER_ANCHOR` 常量
- 徽标尺寸从 36pt 缩小到 22pt（因叠加在缩略图上而非独立显示），字号从 14px 降到 11px，`Shadow.md` 降为 `Shadow.sm`

**收益**：聚合簇与单张照片视觉统一，用户一眼识别为照片标记；数量徽标提供聚合信息，点击仍放大展开为单张。

**验证**：`npx tsc --noEmit` 通过。

### 19. 照片查看器滑动卡死重构（性能 / 交互，对齐 iOS Photos 联动机制）

**现象**：照片查看器（预览模式）底部画廊与主图双向联动滑动卡死——慢速滑动正常，**快速甩动**画廊或主图时界面冻结（此问题经多轮修复：跟手动画 → 速度阈值暂缓 → 仍未根除）。

**调研结论**：
- **iOS Photos 机制**：底部缩略图条与全屏照片是两个独立 UIScrollView。缩略图条滚动时 `scrollViewDidScroll` 计算当前 index，对照片分页列表执行 `scrollToItem(at:animated:false)` —— **瞬时跳页，不做动画翻页、不逐帧跟手**，联动本质是「每跨一格瞬切一页」，零程序动画。
- **卡死根因**：此前所有跨列表同步用 `scrollToIndex(animated:true)`。快速甩动画廊时每次跨槽都启动/打断一次 UIScrollView 动画，期间 FlatList 持续触发虚拟化重渲染 + 全屏大图加载风暴，主线程被占满 → 卡死。
- **库方案**：`react-native-reanimated-carousel` 提供 thumbnails 联动，但会接管整个主图交互（双击缩放、拖拽关闭均为自研），替换代价大且不可控，**不采用**。

**修改**（`src/components/photo-album/photo-viewer.tsx`）：
- **所有跨列表程序滚动改 `animated:false` 瞬时跳转**：
  - `onGalleryScroll` 画廊跨槽 → 主图 `scrollToIndex({ index, animated: false })` 瞬时切页（惯性经过多个槽时逐槽瞬切）
  - `useEffect [currentIndex]` 主图翻页 → 画廊 `scrollToIndex({ index, viewPosition: 0, animated: false })` 瞬时居中
  - `handleThumbnailPress` 点击缩略图 → 主图 `scrollToIndex({ index, animated: false })` 瞬时翻页
- **删除旧同步复杂度**：`FAST_SYNC_THRESHOLD` 速度阈值、`lastScrollRef` 速度估算、`snapAfterScroll`、`onGalleryScrollEndDrag`/`onGalleryMomentumEnd`、`disableIntervalMomentum`、`mainListSyncRef`
- **吸附交给原生**：`snapToInterval + snapToAlignment="start" + decelerationRate="fast"`，惯性结束自动落在最近整槽（当前项始终居中），不再手动兜底
- **回环防护简化为两重**：`galleryInitiatedRef`（画廊发起同步时阻止 useEffect 回滚）+ `programmaticScrollRef`（程序跳转时跳过 onGalleryScroll）

**收益**：全程不存在任何 `animated:true` 的程序滚动打断 UIScrollView，与 iOS 图库行为一致，快速滑动不再卡死。

**验证**：`npx tsc --noEmit` 通过；真机回归快速甩动画廊/主图滑动流畅无冻结。

### 20. 画廊缩略图显示设计（视觉）

**需求**：非当前项左右加白框、呈竖长方形；当前项不加框。

**修改**（`src/components/photo-album/photo-viewer.tsx`）：
- `GalleryThumbnail` 改**双层结构**：外层 `thumbnailSlot` 固定 `THUMBNAIL_SIZE`(40) 正方形（**每项槽宽统一，居中/snap 计算零改动**）；内层按 `isCurrent` 切换样式
- **当前项**：40×40 无框正方形（照片完整展示）
- **非当前项**：9:16 竖长方形（40 高 × 22 宽），`borderLeftWidth/borderRightWidth` 各 1.5pt 白色竖线夹住（上下无框），图片 `contentFit="cover"` 填充
- 新增常量 `THUMBNAIL_ASPECT = 9 / 16`、`INACTIVE_BORDER_WIDTH = 1.5`；删除旧 `thumbnailActive` 全描边样式，新增 `thumbnailSlot`/`thumbnailInactive`

**验证**：`npx tsc --noEmit` 通过；热重载可见滑动时非当前项呈窄竖长形被白线夹住，当前项切回无框正方形。

### 21. 隐藏主图列表横向滚动条（UI）

**现象**：主图下方 / 缩略图上方出现横向滚动条。

**根因**：主图 FlatList（`horizontal` + `pagingEnabled`）未设置 `showsHorizontalScrollIndicator={false}`（底部画廊已设置），iOS 上翻页滚动时显示横向滚动条。

**修改**（`src/components/photo-album/photo-viewer.tsx`）：主图 FlatList 补充 `showsHorizontalScrollIndicator={false}`。

**验证**：`npx tsc --noEmit` 通过；主图与画廊两个横向列表均不再显示滚动条。

### 22. 个人信息面板增加「地点」（功能增强）

**需求**：个人面板增加地点——大地图上长按某点保存为收藏坐标（类似收藏地点），面板显示统计数字 + 地点列表。

**方案**（会话级内存存储，与路径一致，MVP 不引入持久化层）：
- **新建** `src/types/place.ts`：`Place` 类型（`id` / `name` / `latitude` / `longitude` / `createdAt`）
- **新建** `src/hooks/use-places.ts`：`usePlaces()` → `{ places, addPlace, removePlace }`，`placesRef` 镜像避免闭包陈旧值（同 useRoutes 模式）
- **新建** `src/components/map-save-place-card.tsx`：长按「保存地点」**悬浮卡片**——红点标记长按点，玻璃坐标卡片（名称输入 + 坐标文本）悬浮在红点上方（BubbleTail 尾巴指向红点）；定位用长按点 MapView 内像素坐标，卡片外区域穿透到地图
- **修改** `src/app/index.tsx`：长按恢复「红点 + 坐标卡片」标点样式并承载保存操作（无独立底部卡片）；`moveMap` / `handleMapPress` / `handleRegionChange` 统一关闭卡片；新增 `handleSelectPlace`（定位地图到地点坐标）；ProfileSheet 传入 `placeCount` / `places` / `onRemovePlace` / `onSelectPlace`；移除原 popup 浮动卡片（功能合并入 MapSavePlaceCard）
- **修改** `src/components/profile-sheet.tsx`：`ExpandedSection` 增加 `'places'`；收起态统计行「照片 / 路径 / 地点」三栏；扩展态 `'places'` 渲染地点列表（名称点击定位 + 坐标小字 + 删除）

**按钮布局**（`map-save-place-card.tsx` actions 区）：底部三枚**同款按钮**按「添加 → 收藏 → 取消」排序，`flex: 1` 均分卡片宽度、等间距、图标 + 白色文字居中横排——添加（系统蓝 `#0A84FF` + plus 图标）、收藏（橙色 `#FF9F0A` + star.fill 图标）、取消（系统灰 `#8E8E93` + xmark 图标）。「添加」「收藏」为同一地点列表的两种入口（收藏带星标语义），均保存当前坐标。

**验证**：`npx tsc --noEmit` 通过。交互闭环：长按地图 → 红点 + 悬浮坐标卡片（含「添加 / 收藏 / 取消」三按钮）出现 → 添加/收藏保存或取消 → 个人面板「地点」统计 +1 → 展开地点列表点击名称定位地图 / 删除。

### 23. 右侧按钮组增加「拍照」按钮（功能增强）

**需求**：右侧悬浮操作组增加拍照按钮，调用系统相机。

**方案**：
- 新增依赖 `expo-image-picker`（`npx expo install`，SDK 57 匹配版本 `~57.0.7`）；`app.json` 配置插件（`cameraPermission` 中文文案，`microphonePermission: false` 去掉录音权限）
- **修改** `src/app/index.tsx`：
  - 新增 `handleTakePhoto`：`requestCameraPermissionsAsync()` 请求相机权限（拒绝则 Alert 引导去系统设置）→ `launchCameraAsync({ mediaTypes: ['images'], quality: 1 })` 调用系统相机 → 拍摄成功后 `MediaLibrary.saveToLibraryAsync(uri)` 保存到系统相册（web 端 MediaLibrary 能力有限，跳过保存）→ 异常捕获并 `console.error` + Alert
  - 保存到系统相册后，相册媒体监听（`mediaLibraryDidChange`）感知新照片，地图照片标记**增量自动出现**
  - 右侧按钮组顶部（「我的」之前）新增拍照按钮（iOS `camera.fill` / Android `camera_alt` / Web `camera_alt`）

**验证**：`npx tsc --noEmit` 通过。交互闭环：点拍照按钮 → 相机权限弹窗 → 系统相机拍摄 → 照片存入系统相册 → 地图照片标记自动增量出现（相册面板可见）。iOS 需重新 prebuild（新增 NSCameraUsageDescription 权限文案）。

**问题与修复**：iOS 真机点击拍照按钮直接闪退——根因是 dev client 的 `Info.plist` 缺少 `NSCameraUsageDescription`（expo-image-picker 插件配置晚于 prebuild，Info.plist 未重新生成），iOS 调起 `UIImagePickerController` 相机时因未声明权限文案直接终止进程。修复：手动向 `ios/Omni/Info.plist` 补入 `NSCameraUsageDescription`（文案与 app.json 插件一致），重新构建 dev client 生效。web 端不受影响。

**API 迁移**：SDK 57 中 `MediaLibrary.saveToLibraryAsync` 已废弃（从 `expo-media-library` 直接导入会抛错），拍照保存改用新的 class-based API——`Asset.create(uri)` + `requestPermissionsAsync(true)`（writeOnly 写权限），权限未授予时 Alert 引导。

### 24. 路径绘制（轨迹录制）（功能增强）

**需求**：右侧按钮组增加「路径绘制」按钮，弹出底部面板（样式参考个人面板），显示总里程（公里）/ 耗时（小时）/ 当前海拔（米），按钮：开始 / 继续 / 结束。

**交互确认**（AskUserQuestion）：「开始」仅启动一次（idle 可用）；「暂停/继续」为同一按钮在 recording/paused 间来回切换；结束后轨迹保存为路线并入现有路径列表。

**方案**：
- **修改** `src/types/route.ts`：`Route.format` 增加 `'record'`（应用内绘制轨迹，无源文件）
- **修改** `src/utils/geo.ts`：新增 `distanceMeters`（haversine 大圆距离，里程累加）
- **修改** `src/hooks/use-routes.ts`：新增 `addRecordedRoute(points)`——单段 Route（format: 'record'、raw 坐标模式、颜色按 ROUTE_COLORS 循环分配、名称「绘制轨迹 N」）
- **新建** `src/hooks/use-track-recorder.ts`：录制状态机 `idle → recording → paused`；`watchPositionAsync`（High 精度，1s / 2m）采集轨迹点（经纬度+海拔+时间戳），相邻点距离累加为总里程，耗时 recording 期间每秒 tick 刷新（暂停不计），暂停时移除定位订阅省电；`stop()` 返回轨迹点并重置
- **新建** `src/components/track-record-panel.tsx`：底部弹层与个人面板一致——复用 `BottomSheetModal` + `useBottomSheet`（Modal + 遮罩 + 抓手 + 下滑关闭动画，不透明主题色背景、顶部圆角）；内容为标题 + 统计三列（总里程/耗时/海拔，tablenums 数字）+ 状态提示 + 按钮「开始 / 暂停↔继续 / 结束」三枚同款均分（蓝/灰↔绿/红，disabled 置灰；「开始」仅 idle 可用）
- **修改** `src/app/index.tsx`：右侧按钮组「拍照」下方新增「路径绘制」按钮（iOS 曲线图标）；挂载 TrackRecordPanel（关闭面板不停止录制，hook 由首页持有）；录制中实时轨迹以临时红色 Route 叠加在地图上（liveRoute），结束后 `addRecordedRoute` 转为正式路线

**验证**：`npx tsc --noEmit` 通过。交互闭环：点绘制按钮 → 面板弹出 → 开始（权限请求 + 首次定位，开始后禁用）→ 录制中地图实时显示红色轨迹、统计更新 → 「暂停/继续」按钮来回切换 → 结束 → 轨迹保存为「绘制轨迹 N」路线（个人面板「路径」标签可管理、删除）。

**问题与修复**：暂停后「开始」按钮仍可点，误触会触发 `start()` 重置录制（里程归 0）导致「结束」不可用。修复：paused 状态「开始」按钮禁用置灰（只能走「继续」）；「结束」可用性由 `distanceM > 0` 改为 `pointCount >= 2`（开始过且 ≥2 点即可结束保存，原地暂停也可结束）。

### 25. 登入面板（功能增强）

**需求**：实现登录面板。交互确认（AskUserQuestion）：手机号+验证码登录（本地模拟）+ 小字切换账号密码登录；下方微信/QQ 快捷登录入口；登录态本地持久化；入口在个人面板顶部。

**方案**：
- **新增依赖** `@react-native-async-storage/async-storage`：登录态持久化
- **新建** `src/hooks/use-auth.ts`：`useAuth()` → `{ user, hydrated, login, logout }`——启动时从 AsyncStorage 恢复登录态（`hydrated` 标志避免启动闪现未登录），`login` 写入、`logout` 清除；导出 `User` 类型（phone / nickname / provider / loginAt）、`AuthProvider`（'phone' | 'password' | 'wechat' | 'qq'）与 `maskPhone` 掩码工具
- **新建** `src/components/login-sheet.tsx`：底部弹层与个人面板一致（`BottomSheetModal` + `useBottomSheet`）；内容自上而下——标题行（验证码登录/账号密码登录 + 关闭）、手机号输入（11 位校验）、验证码/密码行（code 模式带「获取验证码」按钮 60s 倒计时，演示码 `123456`；password 模式 `secureTextEntry`）、登录按钮、小字切换（账号密码登录 ↔ 验证码登录）、分隔线「其他登录方式」、微信（`#07C160`）/ QQ（`#12B7F5`）快捷登录（点击即成功）；`KeyboardAvoidingView` 处理键盘遮挡
- **修改** `src/components/profile-sheet.tsx`：收起态头部改造——未登录显示灰色人像图标 + 「未登录」+ 副标题「点击登录，开启轨迹与地点同步」，点击头像区域打开登录面板；已登录显示昵称首字头像 + 昵称 + 掩码手机号（微信/QQ 快捷登录显示来源）+ 「退出」入口
- **修改** `src/app/index.tsx`：接入 `useAuth`；ProfileSheet 传 `user` / `onLogin` / `onLogout`

**验证**：`npx tsc --noEmit` 通过。交互闭环：个人面板未登录点头像 → 登录面板弹出 → 输入手机号 → 获取验证码（提示演示码 123456）→ 登录成功 → 面板显示昵称/掩码手机号；退出后恢复未登录态；重启 app 登录态保持。

**问题与修复**：真机报 `[UIKitCore] Attempt to present <RCTFabricModalHostViewController> ... already presenting` 崩溃——登录面板最初作为顶层 Modal 与个人面板（同为顶层 Modal）同时 present 到同一宿主 VC（DevLauncherViewController），UIKit 禁止。修复：LoginSheet 移入 ProfileSheet 的 Modal **children 内部**嵌套渲染（与照片查看器同模式：`Modal transparent` 嵌套，present 到父 Modal 的 VC 上，不占用根 VC），视觉上盖在个人面板之上；面板每次打开时重置登录面板状态，防止残留。注意：仅放 Fragment 与 Modal 平级无效（两个 Modal 仍同挂根 VC 冲突），必须作为 children 嵌套。

另报 `[Worklets] Tried to modify key 'current' of an object which has been already passed to a worklet`——根因：`useBottomSheet` 的 `close()` 中 `withTiming` 完成回调（worklet）捕获了 `onCloseRef`（普通 ref 对象 `{ current }`），Worklets 捕获时即把该对象设为不可变，此后任何 `onCloseRef.current = onClose`（每次面板 render 后）都触发警告——这与「面板关闭后再打开时报警」的时机吻合。修复：**彻底移除 ref 间接层**，`close` 的 `useCallback` 依赖加入 `onClose`，worklet 回调直接捕获 onClose 函数本身（函数引用传递不会被冻结），闭包由依赖数组保证最新。同时给 use-bottom-sheet.ts / login-sheet.tsx / photo-detail-sheet.tsx 补 `"use no memo"` 指令（React Compiler 会干扰 sharedValue + worklet 同步，与项目其他 Reanimated 文件一致）。注意：此前把 ref 同步移入 useEffect 的做法无效——对象被捕获后无论何时写入 `current` 都会警告。

### 26. 相册视频 AVPlayer 无权限警告（问题修复）

**现象**：真机打开相册功能时刷屏 `Failed to load available audio tracks / subtitle tracks for file:///.../IMG_XXXX.MP4#YnBsaXN0...`，`Code=257 don't have permission to view it`。

**根因（关键，已确认）**：**iOS 18+ 系统 bug + expo 已知 issue**（[expo/expo#31620](https://github.com/expo/expo/issues/31620)「iOS 18 Video Permission Issue」），与权限等级无关：
- iOS 18+ 真机上（iOS 17 及以下、模拟器均正常），即使相册权限为「允许访问所有照片」（full），`PHImageManager.requestAVAsset` 返回的 URL 带 `#YnBsaXN0MDDR...`（`RecommendedForImmersiveMode` 二进制 plist 沙盒钥匙），用它重建 `AVURLAsset` 后 AVPlayer **连 `assetProperty_AssetType`/`assetProperty_Tracks` 都读不出**（Code=257）。
- 因此视频缩略图生成、播放在本就全部失败（网格视频单元一直是灰色占位），且每次创建 AVPlayer 都刷音轨/字幕轨警告。expo-video / expo-av 均受影响，社区无一致解法（官方未完全修复，issue 曾被 reopen）。
- 此前的「limited 权限」假设不成立：用户实测 full 权限 + reload 后依然报错。真机日志里的 URL 带沙盒钥匙后缀，说明 `requestAVAsset` 成功但文件读取仍被系统拒绝。

**方案**（用户决策：底层无法读取视频 → 数据层跳过视频，相册只显示图片）：
- `use-photo-album.ts`：Query 改为 `.within(AssetField.MEDIA_TYPE, [MediaType.IMAGE])`——相册数据层**只查询图片**，不再包含视频；物化时 `if (mediaType !== MediaType.IMAGE) return null` 兜底过滤；去掉 `getDuration()` 取值（图片时长恒 null）。
- 效果：网格与查看器列表里**根本没有视频项** → 任何视频 AVPlayer 都不会创建 → 警告从源头消除（不依赖版本/权限判断）。
- 之前加的 `video-thumb-cell` 的 `enabled` prop、`photo-viewer` 的 `videoEnabled` prop、`photo-library` 的 `videoPlaybackSupported` 判定/传参已回退删除；视频相关 UI 组件保留为防御性代码（列表无视频即不渲染，未来系统修复后可仅改数据层恢复）。
- limited 下的「开启完整访问 / 管理…」保留（升级后照片全量显示）。

**验证**：`npx tsc --noEmit` 通过。iOS 18+ 真机打开相册：**只有图片**、视频项不再出现、**零音轨/字幕轨 Code=257 警告**；个人面板照片统计与网格一致（纯图片数）。

**待后续处理（系统底层限制，当前无法在应用层解决）**：
- 相册视频预览功能暂不可用，根因是 **iOS 18+ 系统底层的相册文件访问限制**（沙盒钥匙对 AVFoundation 失效，expo/expo#31620 官方尚未完全修复），**应用层无法绕过**，故当前采用「数据层跳过视频」的规避方案。
- 后续处理方向（跟踪 [expo/expo#31620](https://github.com/expo/expo/issues/31620) 状态）：
  1. **等 expo/Apple 官方修复**：issue 修复或 iOS 版本更新后，恢复 `use-photo-album.ts` 查询为 `[IMAGE, VIDEO]` 即可（视频相关 UI 组件已保留为防御性代码）；
  2. **「复制视频到沙盒」workaround**：社区验证对播放有效（先把视频 `FileSystem.copyAsync` 到 app 沙盒再播放），但复制大视频有耗时与存储成本，需评估后实施。

### 27. 路径绘制面板按钮改版（交互 / 视觉，2026-08-04）

**需求**（用户原话）：路径绘制面板的方向按钮不好，希望是圆角方形或圆形；中间的按钮为开始按钮，点击开始后变为拍照按钮。交互确认（AskUserQuestion）：采用**三按钮横排**布局。

**方案**（`src/components/track-record-panel.tsx` + `src/app/index.tsx`）：
- 按钮从长条矩形改为**三枚圆形按钮**横排居中：左右 60pt（radius 30）、中央主按钮 68pt（radius 34）略大突出；纯 SF Symbol 图标（play / pause / camera / stop），不再显示按钮文字
- **中央主按钮**：idle 时蓝色 `play.fill`「开始」→ 点击开始录制后变为蓝色 `camera.fill`「拍照」（recording / paused 均显示拍照）
- **左侧按钮**：初始（idle）即显示灰色 `pause.fill`「暂停」（禁用态置暗），recording 时灰色可点（点击暂停），paused 时绿色 `play.fill`「继续」（点击恢复）——`paused` 为唯一显示「继续」的状态
- **右侧按钮**：红色 `stop.fill`「结束」，可用性不变（`pointCount >= 2` 才可点）
- 新增 prop `onCapture`：由首页注入已有 `handleTakePhoto`（`requestCameraPermissionsAsync` → `launchCameraAsync` → `Asset.create` 保存相册），相册监听 `mediaLibraryDidChange` 自动将带 GPS 的新照片增量显示为地图标记——**拍照功能零重复实现**
- 面板高度 `TRACK_PANEL_HEIGHT` 236 → 272（适配更高圆形按钮，`space-around` 水平均分）

**验证**：`npx tsc --noEmit` 通过；热重载即可查看效果。

### 28. 全仓冗余代码核查（冗余清理，2026-08-04）

**范围**：两个并行扫描（零引用文件/导出/样式/变量 + 7 个历史功能迁移点残留），逐文件精读 + grep 引用计数交叉验证，60 个文件全部覆盖。

**7 个迁移点核查结论**：
- **无残留（已干净）**：路径按钮占位、地图 popup 浮动卡片（历史仅注释）、MediaLibrary API 迁移（`saveToLibraryAsync` 零调用）、照片聚类（`CLUSTER_ANCHOR` 已删）、登入面板 Modal 嵌套（正确形态）
- **视频废弃残留**：photo-grid 的 VIDEO 分支、photo-viewer 的 `ViewerVideo` 视频段、video-thumb-cell.tsx、photo-album.ts 的 VIDEO/duration 类型——**全部保留**（用户决策，维持 #26「防御性保留、未来仅改数据层恢复」策略）
- **BottomSheet 迁移残留**：`use-bottom-sheet.ts` 的 `restingOffset` 参数——无调用方（profile-sheet 因 SharedValue 同帧读写陈旧值问题已弃用该 API，改为纯 JS 常量定位），删除

**已清理项（修改 10 文件）**：
- `src/constants/theme.ts`：删除 `Fonts` 对象（sans/serif/rounded/mono 全零引用，唯一引用方为 themed-text 死样式 code）与 `backgroundSelected` 两处（零引用，`ThemeColor` 联合类型随之收窄）
- `src/components/themed-text.tsx`：删除 `title`/`link`/`code` 三个无调用方 type 分支与对应样式（全仓实际仅用 default/small/smallBold/subtitle/linkPrimary）
- `src/hooks/use-bottom-sheet.ts`：删除 `restingOffset` 可选参数（类型成员 + open 实现 + 依赖数组），`open()` 直接停靠 0
- `src/app/index.tsx`：移除 `useAuth()` 解构中未使用的 `hydrated`
- `src/hooks/use-routes.web.ts`：补齐 `addRecordedRoute`（Web 占位版缺该方法，路径绘制保存路线时 Web 端解构为 undefined 会抛错——迁移 #24 遗漏，对齐 native 签名）
- 9 处零引用内部类型/常量去掉 `export` 关键字：`GeocodeErrorKind`、`UseAuthResult`、`LocationState`、`GeocodeSearchState`、`HeadingState`、`UseRoutesResult`、`UseTrackRecorderResult`、`TailDirection`、`PHOTO_CLUSTER_RADIUS_PX`

**保留的 export（公共 API，非冗余）**：`ThemedTextProps` / `ThemedViewProps` / `GlassPanelProps` / `BottomSheetModalProps`（组件 props 类型）、`UseBottomSheetOptions` / `BottomSheetControls`（use-bottom-sheet 公共 hook 类型）、`TrackStatus`（use-track-recorder 公共状态类型）。

**验证**：`npx tsc --noEmit` 通过。

### 29. 路径列表放大（交互 / 视觉，2026-08-04）

**需求**（用户原话）：路径列表太小了，需要调整大一点；导入按钮也小。

**修改**（`src/components/profile-sheet.tsx`「路径」扩展态）：
- **路径行**：行内垂直间距 `Spacing.two`(8pt) → `Spacing.three`(16pt)，行高约 38 → 54pt
- **路径名称**：字号 14 → 16pt（新增 `routeName` 样式，lineHeight 22），点击定位区域随之加大
- **操作图标**：显隐 18 → 20、坐标模式 globe 16 → 18、删除 16 → 18
- **路线颜色点**：12 → 14pt
- **导入按钮**：图标 `folder.badge.plus` 20 → 24pt，padding `Spacing.half`(2) → `Spacing.two`(8pt)（点击区域加大）

**验证**：`npx tsc --noEmit` 通过；热重载可见路径条目更醒目易点。

### 30. 路径重命名功能（功能增强，2026-08-04）

**需求**（用户原话）：增加一个重命名功能——个人面板「路径」列表中对路径重命名。

**方案**：
- **新建** `src/components/rename-route-sheet.tsx`：重命名弹层（`BottomSheetModal` 骨架 + `useBottomSheet`，与登录面板同模式**嵌套渲染在 ProfileSheet Modal children 内**，避免两个顶层 Modal 同时 present 崩溃）；内容为标题行「重命名路径」+ 名称输入（自动聚焦、预填当前名、`maxLength 30`、键盘 done 提交）+ 取消/确定按钮（空名禁用确定）；文件首行 `"use no memo"`（sharedValue + pan worklet，React Compiler 防护）
- **修改** `src/hooks/use-routes.ts`：新增 `renameRoute(id, newName)`——trim 去首尾空格、空名忽略，`commit` 更新 routes state；`use-routes.web.ts` 同步 no-op 占位
- **修改** `src/components/profile-sheet.tsx`：路径行「坐标模式」与「删除」之间加铅笔按钮（iOS `pencil` / Android `edit`，18pt）→ 打开重命名弹层；新增 `renamingRoute: Route | null` state 与 `onRenameRoute` prop
- **修改** `src/app/index.tsx`：`useRoutes()` 解构 `renameRoute` 传入 ProfileSheet `onRenameRoute`

**验证**：`npx tsc --noEmit` 通过。交互闭环：路径列表点铅笔 → 重命名面板弹出（预填旧名）→ 输入新名 → 确定 → 列表与地图路线名称同步更新。

### 31. 重命名面板被键盘覆盖（问题修复，2026-08-04）

**现象**（用户原话）：重命名面板被输入器覆盖了——面板固定 212pt 高低于键盘高度（约 300pt），autoFocus 弹键盘后面板整体被键盘盖住。

**根因**：`BottomSheetModal` 卡片 `absolute bottom: 0`，键盘弹出覆盖屏幕底部区域；卡片高度 < 键盘高度时内容不可见；原 `KeyboardAvoidingView` 的 padding 压缩在固定矮卡片内无效（padding 需求大于卡片空间，内容被挤压/裁切）。

**修复**（`src/components/rename-route-sheet.tsx`）：
- **移除 `KeyboardAvoidingView` 包裹**（不再依赖内容压缩避让）
- 新增**软键盘监听**（iOS `keyboardWillShow/Hide`、Android `keyboardDidShow/Hide`）→ `kbHeight` state
- kbHeight 变化时 `height.value = withTiming(RENAME_HEIGHT + kbHeight)`——卡片高度动态增高为「内容高 + 键盘高」，内容固定在卡片顶部**始终在键盘上方**；键盘收起恢复 `RENAME_HEIGHT`（`ANIM_DURATION` 与键盘动画同步，不突兀）
**验证**：`npx tsc --noEmit` 通过。打开重命名面板 → 自动聚焦 → 卡片随键盘同步长高，输入框与「取消/确定」按钮完整可见；键盘收起面板恢复原高度。

### 34. 搜索框键盘交互优化（问题修复 / 交互，2026-08-04）

**需求**（用户原话，三轮连报）：
1. 搜索框点击输入的时候会被输入器覆盖遮挡
2. 间距有点大可以调整小一点吗
3. 点击搜索框后，点击其他地方不会关闭搜索功能

**背景**：搜索框位于屏幕底部（原 Tab 栏位置），iOS 键盘从底部弹出会直接盖住搜索框。

**方案一：键盘避让 + 间距收紧**（`src/components/map-search-bar.tsx`）：
- 监听 iOS `keyboardWillShow/Hide`，键盘弹出时搜索框整体 `translateY` 上移（`withTiming` 250ms 与键盘动画同步），键盘收起回落原位
- 上移量 = 键盘高 − 底部安全区 `insets.bottom`：扣掉搜索框原有 bottom 定位（`insets.bottom + Spacing.two`），上移后搜索框底部与键盘顶部**仅留约 8pt 呼吸间距**（初版按键盘全高上移，间距约 42pt 偏大，故第二轮收紧）
- Android 依赖系统 `adjustResize` 自动顶起，不做处理（避免双倍上移）；文件首行新增 `"use no memo"`（sharedValue + useAnimatedStyle worklet，React Compiler 防护）

**方案二：点击外部关闭搜索**（`src/components/map-search-bar.tsx` + `src/app/index.tsx`）：
- MapSearchBar 改为 `forwardRef`，`useImperativeHandle` 暴露 `dismiss()`——输入框失焦（键盘收起）+ 隐藏结果列表，**保留已输入文字**
- 新增 `active` state：输入框 `onFocus` 置 true 才显示结果列表（`loading || error || (hasResults && active)`）；`dismiss()` 置 false 隐藏
- 选中搜索结果后自动收起（`handleSelect` 内 blur + `setActive(false)`）
- `index.tsx`：新增 `searchBarRef`，`handleMapPress`（点击地图空白）调用 `searchBarRef.current?.dismiss()`

**验证**：`npx tsc --noEmit` 通过。交互闭环：点搜索框聚焦显示结果 → 键盘弹出搜索框平滑上移贴键盘（8pt 间距）→ 点地图任意处键盘收起、结果列表消失（文字保留）→ 再点搜索框恢复；点结果跳转后自动收起。

### 35. 搜索框与按钮组遮挡互斥（问题修复 / 交互，2026-08-04）

**需求**（用户原话）：搜索框会被按钮组的按钮挡住，需要优化。

**背景**：搜索框铺满屏幕宽度（含右侧）、按钮组固定定位在右下角（`bottom: insets.bottom + BOTTOM_BAR_OFFSET`）。两者垂直方向仅约 13pt 间距，正常不重叠；但**搜索聚焦时必然冲突**：
- iOS 键盘避让（#34）把搜索框整体上移贴键盘，上移后进入按钮组垂直区域 → 右侧按钮盖住搜索框右半部分
- 结果列表（激活时向上展开，最高 300pt、通栏宽度）同样进入按钮组垂直区域 → 按钮盖住结果列表右缘

**方案**：搜索会话激活时隐藏右侧悬浮按钮组（与 Google/Apple Maps 搜索时隐藏控件一致）：
- `src/components/map-search-bar.tsx`：新增可选 prop `onFocusChange?: (active: boolean) => void`——**绑定搜索会话 `active` 而非 blur**（iOS 键盘收起会触发 blur 但会话未结束）：`onFocus` 置 active 并通知 true；选中结果 / `dismiss()` 结束会话并通知 false
- 结果/状态区渲染条件统一为 `active && (loading || error || hasResults)`：结果列表与按钮组严格互斥，任一时刻二者不会同时可见
- `src/app/index.tsx`：新增 `searchActive` state，`onFocusChange={setSearchActive}`；右下悬浮按钮组整组（含图层浮层）用 `{!searchActive && …}` 条件渲染

**验证**：`npx tsc --noEmit` 通过。点搜索框聚焦 → 按钮组隐藏、键盘弹出搜索框上移与结果列表均不被按钮遮挡（含键盘收起触发 blur 后结果仍开着的场景）→ 点地图/点结果结束会话 → 按钮组恢复显示。

### 36. 取消聚焦清空搜索框（交互，2026-08-04）

**需求**（用户原话）：取消聚焦应该清空搜索框内容。

**背景**：#34 原设计为 dismiss 后「已输入文字保留」，导致点地图收起搜索后搜索框仍残留旧文字，再次聚焦会立刻弹出旧结果。

**方案**：`src/components/map-search-bar.tsx` 的 `dismiss()`（点地图收起搜索的唯一入口）在失焦 + 隐藏结果的基础上增加 `setQuery('')` 清空已输入文字；选中结果（`handleSelect`）路径保持不清空，便于查看刚搜索的关键词。`MapSearchBarHandle.dismiss` 注释同步更新。

**验证**：`npx tsc --noEmit` 通过。点地图收起搜索 → 输入框失焦、结果列表消失、文字清空 → 再次聚焦从空白开始；选中结果跳转后文字保留。

### 37. 标点图层 + 地点→标点全量重命名（功能增强 / 重命名，2026-08-04）

**需求**（用户原话）：图层按钮的二级面板增加标点（地点），把个人面板的地点修改成标点，必要情况下代码变量也需要修改。

**功能增强——「标点」图层**：
- `map-layer-menu.tsx`：`LayerKey` 增加 `'placemarks'`，`OPTIONS` 新增「标点」（路径 / 照片 / 标点三项）
- `satellite-map.tsx`：新增 `placemarks` prop 与 `PlacemarkMarkers` 组件——橙色圆点（12pt，白边 + 轻阴影，外扩 24pt 透明点击区）锚点取圆点中心，点击弹 Callout 显示名称与坐标；颜色沿用保存卡片「收藏」按钮的橙（#FF9F0A），与长按预览红点形成「待保存红 → 已收藏橙」语义
- `types/map.ts`：`SatelliteMapProps` 增加 `placemarks?: Placemark[]`
- `index.tsx`：`layers` 初始化为 `{ routes: true, photos: true, placemarks: true }`；`visiblePlacemarks` memo 按 `layers.placemarks` 过滤后传入 `SatelliteMap`（坐标为长按地图取回的原生坐标，与个人面板点击定位同源，无需 GCJ-02 转换）

**全量重命名——地点 → 标点（Place → Placemark）**：
- `types/place.ts` → `types/placemark.ts`：`Place` → `Placemark`
- `hooks/use-places.ts` → `hooks/use-placemarks.ts`：`usePlaces`/`places`/`addPlace`/`removePlace` → `usePlacemarks`/`placemarks`/`addPlacemark`/`removePlacemark`
- `components/map-save-place-card.tsx` → `components/map-save-placemark-card.tsx`：组件名 `MapSavePlaceCard` → `MapSavePlacemarkCard`；UI「保存为地点 / 地点名称」→「保存为标点 / 标点名称」
- `components/profile-sheet.tsx`：props `placeCount/places/onRemovePlace/onSelectPlace` → `placemarkCount/placemarks/onRemovePlacemark/onSelectPlacemark`，扩展态 `'places'` → `'placemarks'`，样式 `placeRow/placeNameRow` → `placemarkRow/placemarkNameRow`；UI「地点 / 暂无收藏地点 / 开启轨迹与地点同步」→「标点 / 暂无收藏标点 / 开启轨迹与标点同步」
- `app/index.tsx`：`savePlaceTarget` → `savePlacemarkTarget`、`handleSelectPlace` → `handleSelectPlacemark`、默认名称「地点 N」→「标点 N」
- 搜索框占位「查找地点与地址、图片、轨迹」为地理搜索提示（检索地理场所），非收藏列表语义，保持不变

**验证**：`npx tsc --noEmit` 通过。图层菜单「标点」勾选/取消实时控制地图上收藏标点橙点的显隐；长按保存 → 个人面板「标点」统计数与列表、地图橙点同步；「标点」扩展态点击定位 / 删除正常。

### 32. 海拔高度测速（功能增强，2026-08-04）

**需求**（用户原话）：按钮组增加一个按钮，海拔高度测速，跳转一个页面或面板，这个页面只显示海拔高度，并且是精美的页面。

**方案**：
- **新建** `src/hooks/use-altitude.ts`：海拔监测 hook——`useAltitude()` → `{ status, altitudeM, samples, start, stop }`；定位生命周期复用 `usePositionWatch`（见 #33）
  - `start()`：经公共 hook 请求定位权限 → `getCurrentPositionAsync`（High 精度）**单次快照立即出值**（避免订阅首包前一直显示 `--`）→ `watchPositionAsync`（High 精度，1s / 0m）持续订阅刷新；权限拒绝置 `denied`、定位异常置 `error` 终态
  - `samples`：会话内最近海拔样本（最多 60 个 ≈ 1 分钟），供面板迷你折线与最低/最高值
  - `stop()`：停止订阅并回到 idle（订阅清理由公共 hook 负责）
  - 状态机：`idle → locating（权限通过、首个数值前）→ active（持续刷新）`，终态 `denied / error`
- **新建** `src/components/altitude-sheet.tsx`：海拔底部面板（`ALTITUDE_SHEET_HEIGHT = 292`），与路径绘制面板同款——复用 `BottomSheetModal` + `useBottomSheet` + `createDismissPan`（Modal + 遮罩 + 抓手 + 下滑关闭动画，不透明主题色背景、顶部圆角）；**面板打开（visible false→true）时自动 `start()` 开始 GPS 订阅，关闭时 `stop()`**（组件常驻挂载）
  - 内容自上而下：标题行（`mountain.2.fill` 山形图标 + 「海拔高度」+ xmark 关闭）→ **超大数字**（68pt / 700 加粗当前海拔 + 单位「米」，`tabular-nums` 防跳动）→ **SVG 迷你折线**（react-native-svg 绘制最近 60 秒样本：`LinearGradient` 渐变填充 + 渐变描边，样本不足 2 个时显示占位横条）→ 最低/最高海拔（会话内，`--` 兜底）→ 状态行（绿点「实时海拔 · 每秒更新」/ 定位中 spinner「正在获取海拔…」/ 权限拒绝提示 / 定位异常提示）
- **修改** `src/app/index.tsx`：右侧按钮组「路径绘制」下方新增「海拔高度测速」按钮（iOS `mountain.2.fill` / Android/web `terrain`），点击打开 AltitudeSheet；与「我的」「路径绘制」「图层」面板互斥关闭

**验证**：`npx tsc --noEmit` 通过。交互闭环：点海拔按钮 → 面板滑出（GPS 订阅开始）→ 大数字实时刷新、迷你折线随时间滚动 → 最低/最高海拔实时更新 → 下滑关闭（订阅停止）。

**注意**：海拔依赖 GPS 信号，iOS 模拟器（模拟位置）可能返回 0 或 null，真机测试效果最佳。

### 33. 抽公共定位订阅 hook（复用重构，2026-08-04）

**背景**：海拔高度功能（#32）引入后，`use-altitude.ts` 与既有 `use-track-recorder.ts` 出现约 30 行重复样板——「权限请求 → 单次快照 → `watchPositionAsync` 持续订阅 → 订阅清理/卸载」生命周期逐字重复，仅业务回调（海拔提取 / 轨迹点记录）与订阅参数（`distanceInterval` 0 vs 2）不同；`use-location.ts` 亦含同一段「权限 + 快照」模式（第三处，但为无订阅的单次快照、收敛收益低于耦合成本，**保留不动**）。

**新建** `src/hooks/use-position-watch.ts`：`usePositionWatch(options, onUpdate)` → `{ requestPermissionAndLocate, startWatch, stopWatch }`
- 统一「权限请求 → 单次快照（`getCurrentPositionAsync`）→ `watchPositionAsync` 持续订阅 → 卸载自动清理」生命周期
- `options` 静态捕获（`accuracy` / `timeInterval` / `distanceInterval` 参数化，两调用方配置不同）；`onUpdate` ref 镜像（订阅长驻、回调可重建，避免闭包陈旧）
- `startWatch` 幂等（重复开始前先清理旧订阅）；卸载清理内建
- **权限语义不内建**：权限失败处理由调用方决策（recorder 返回 false 提示无法开始、altitude 置 denied 终态），仅提供快照辅助函数

**改造**：
- `use-altitude.ts`：删除本地权限/快照/订阅/清理样板，改经 `usePositionWatch({ High, 1s, 0m }, onUpdate)`；保留海拔提取 + 60 样本维护 + 状态机；新增 `activeRef` 防重复 start
- `use-track-recorder.ts`：删除本地 `watchSubRef` / `stopWatch` / `startWatch` 与权限 + 快照代码，改经 `usePositionWatch({ High, 1s, 2m }, onLocation)`；保留轨迹点采集 + 里程累计 + 状态机 + 计时器；卸载 effect 仅保留计时器清理（订阅由公共 hook 负责）

**验证**：`npx tsc --noEmit` 通过。行为等价性保证：recorder 仍为 2m 采点、暂停→继续重建订阅；altitude 仍为每秒刷新、面板关闭停止订阅。

**未实施（中/低优先级，避免过度改动）**：面板「打开检测」模式（4 处 `prevRef` + useEffect，见 #2 骨架外的残留重复）、loadingRef 互斥锁收敛（2 处）、index.tsx 上帝组件拆分（已有历史记录）。

## 三、验证与回归

- **静态验证**：每阶段 `npx tsc --noEmit` 通过；删除文件后 `rg` 确认无残留引用
- **需真机回归项**：
  - 底部弹层（照片详情 / 我的面板）：开合动画、下拉关闭、手势阈值
  - 地图：磁力计航向锥随朝向更新、照片/路线 Marker 渲染、搜索落点、定位按钮
  - 相册：权限四态门控、limited 条幅、分页加载、EXIF 地理标记渐进出现
  - 照片标记（专项 #8）：ph:// 缩略图在 iOS/Android 能否显示（**重点验证点**）、Marker 点击弹详情大图、拍照后标记自动增量出现（addListener）、Android 无 `tracksViewChanges` 持续追踪
  - 照片聚类（专项 #9）：密集照片聚为簇（缩略图 + 数量徽标）、点击簇放大展开为单张、拖拽/缩放后视口裁剪与重聚类正常、单张点击详情不受影响
  - KMZ 导入（#15）：选择 .kmz 文件后自动解压并渲染路径、KML/GPX/KMZ 三种格式混用正常、损坏 KMZ 友好报错
  - 搜索框（#16）：搜索图标显示、placeholder 文案、圆角视觉效果
  - 照片查看器（#19/#20/#21）：快速甩动画廊/主图不卡死、画廊跨槽主图瞬时切页、主图翻页画廊瞬时居中、点击缩略图跳转、非当前项竖长方形左右白线/当前项无框正方形、两个横向列表均无滚动条、全屏/预览模式切换与拖拽关闭不受影响
  - 地点（#22）：长按地图空白显示红点 + 悬浮坐标卡片（名称输入 + 添加/收藏按钮）、保存后个人面板「地点」统计 +1、展开地点列表点击名称定位地图、删除地点、地图点击/移动/取消关闭卡片
  - 拍照（#23）：拍照按钮调起系统相机、相机权限弹窗文案、拍摄后照片存入系统相册、地图照片标记增量出现、权限拒绝时 Alert 引导、web 端不崩溃
  - 路径绘制（#24）：绘制按钮打开面板、开始→定位权限请求、录制中地图实时红色轨迹、总里程/耗时/海拔实时更新、开始↔暂停切换、暂停后继续恢复、结束保存为「绘制轨迹 N」路线并在个人面板「路径」标签管理/删除、关闭面板不停止录制
  - 登入面板（#25）：个人面板未登录点头像弹出登录面板、验证码/密码切换、获取验证码倒计时、错误/成功 Alert、微信/QQ 快捷登录、登录后头像昵称/掩码手机号展示、退出恢复未登录、重启 app 登录态保持（AsyncStorage）；登录面板与个人面板 Modal 嵌套打开不再报 "already presenting" 崩溃；操作登录流程无 `[Worklets] Tried to modify key 'current'` 警告
  - 相册视频警告（#26）：iOS 18+ 真机打开相册**只显示图片、无视频项**、零音轨/字幕轨 Code=257 警告、个人面板照片统计为纯图片数、limited 条幅与「开启完整访问 / 管理…」正常、图片网格与查看器不受影响
  - 路径绘制按钮改版（#27）：三枚圆形按钮横排居中、中央主按钮 idle 为蓝色「开始」播放图标/点击开始后变「拍照」相机图标（调起系统相机并保存相册、地图照片标记增量出现）、左侧按钮初始显示灰色「暂停」/录制中可点暂停/暂停后绿色「继续」、右侧「结束」可用性不变、面板高度 272 无内容裁切
  - 路径列表放大（#29）：路径行垂直间距 16pt、名称 16pt、显隐 20/globe 18/删除 18、色点 14、导入按钮图标 24 + 点击区域 8pt
  - 路径重命名（#30）：路径行铅笔按钮打开重命名弹层、预填当前名、自动聚焦、空名确定禁用、确定后列表与地图路线名称同步更新、与登录面板同样嵌套无 Modal 冲突
  - 重命名键盘避让（#31）：打开重命名面板键盘弹出时卡片同步长高、输入框与「取消/确定」始终可见、键盘收起面板恢复原高度、下滑关闭正常
  - 海拔高度测速（#32）：右侧按钮组「海拔高度测速」按钮打开面板、打开瞬间 GPS 订阅开始（定位中 spinner → 实时大数字）、68pt 数字每秒刷新 + SVG 迷你折线滚动、最低/最高海拔更新、下滑关闭订阅停止、与「我的/路径绘制/图层」面板互斥、真机 GPS 海拔生效（模拟器可能为 0/null）
  - 搜索框键盘交互（#34）：点击输入键盘弹出搜索框平滑上移仅留 8pt 间距、键盘收起回落原位、点击地图外部收起（失焦 + 隐藏结果列表）、点结果跳转后自动收起、Android 不被键盘遮挡（系统 resize）
  - 取消聚焦清空搜索框（#36）：点地图收起搜索输入框文字清空、再次聚焦从空白开始、选中结果跳转后文字保留
  - 标点图层与重命名（#37）：图层菜单「标点」开关控制地图橙点显隐、长按保存默认名「标点 N」、个人面板统计项/列表/空态均为「标点」、点击标点定位、删除标点后统计数与地图同步
  - 搜索框与按钮组遮挡互斥（#35）：点搜索框聚焦按钮组隐藏、键盘弹出搜索框上移与结果列表均不被按钮遮挡、按回车/下滑收起键盘（blur）结果仍开时按钮组保持隐藏不遮挡、点结果/点地图结束会话后按钮组恢复、图层浮层随按钮组同步显隐
  - 定位订阅重构（#33）：海拔面板开合订阅启停正常、路径录制完整回归（开始→暂停→继续→结束、里程/耗时/海拔统计、轨迹保存为路线）、暂停期间订阅移除省电、卸载无泄漏

## 四、后续可选（未承诺）

- `index.tsx` 上帝组件（约 400 行）进一步拆分
- 各 hook 的 `loadingRef` 互斥锁模式抽取
- 更深层交互打磨（如地图手势与浮层联动、照片查看器性能）

## 五、阶段 3 优化计划（已列入，暂缓执行）

> 状态：**计划已定，暂不实施**。优先处理其他需求，待照片量增长（>5000 张）或用户反馈首屏变慢时再启动。
> 前置依赖：阶段 1（数据管线瘦身）与阶段 2（JS 聚类 + 视口裁剪）均已落地并真机验证。

### 5.1 目标

解决万张级照片场景下「每次启动全量扫描 + JS 侧物化」的首屏延迟与内存开销，实现**首屏秒开 + 滚动丝滑**：
- 万张照片下地图首屏 < 1s
- 地图拖拽时按视口查询，渲染 marker ≤ 50
- 拍照后标记增量出现 < 2s

### 5.2 背景（已核实的核心事实）

- 阶段 1 后数据管线只读轻量元数据（`getLocation`/`getCreationTime` 不解码、不触发 iCloud 下载），但仍需**逐页 Query + 每张 2 次桥接物化**；GPS 照片占比低时扫描页数多（`MAX_PAGES_SCANNED=20` 上限）
- `AssetField` 枚举**不支持 location 过滤**（已核实枚举：时间/类型/尺寸/时长/收藏），原生查询层无法做视口查询——阶段 2 只能在物化后 JS 侧裁剪
- `getUri` 触发 iCloud 下载（`isNetworkAccessAllowed=true`），阶段 1 已从数据管线移除；阶段 3 依旧保持「渲染时才经 ph:// 按需加载缩略图」

### 5.3 方案设计

**原生模块**（Swift / Kotlin + Expo config plugin，经 prebuild 注入）：
1. **后台建库**：App 启动/授权后，低优先级后台遍历相册，仅提取 `{id, latitude, longitude, creationTime}` 写入 SQLite——**不解码图片、不触发 iCloud 下载**（iOS 直接读 `phAsset.location` 元数据；Android 读 MediaStore `LATITUDE`/`LONGITUDE` 列，需 `ACCESS_MEDIA_LOCATION`）
2. **建索引**：按 `(latitude, longitude)` 与 `creationTime` 建索引，支持**包围盒查询**（视口裁剪下沉到原生，数据量从全量降到视口内几十条）
3. **增量更新**：iOS `PHPhotoLibraryChangeObserver` / Android MediaStore 观察者监听相册变化，增量更新数据库并通知 JS 刷新当前视口（替代阶段 1 的 `addListener('mediaLibraryDidChange')` 全量重扫）
4. **SQLite 实现**：用原生自带 SQLite（iOS SQLite3 / Android 内置 SQLite），不引入第三方依赖

**JS 接入**：
- `useGeotaggedPhotos` 改为：按当前视口包围盒查询原生 SQLite（轻量 JSON），取代逐页 Query + 物化
- 渲染层**完全复用阶段 2 的 `clusterPhotos`**，无改动
- 权限与 limited access 逻辑沿用 `useMediaLibraryPermission`

### 5.4 实施范围

| 平台 | 改动 |
| ---- | ---- |
| iOS | Swift 模块：PHAsset 遍历 + SQLite 建库/索引 + 包围盒查询 + `PHPhotoLibraryChangeObserver`；config plugin 注册 |
| Android | Kotlin 模块：MediaStore 查询 + SQLite 建库/索引 + 包围盒查询 + 观察者；config plugin 注册 |
| JS | `use-geotagged-photos.ts` 改造为原生查询驱动（保留 Web 占位）；`SatelliteMapProps`/`useGeotaggedPhotos` 接口微调（视口参数） |
| 回归 | 阶段 1/2 全部交互（ph:// 缩略图、tracksViewChanges、聚类、簇展开、增量刷新、limited access） |

### 5.5 风险与权衡

- **双平台原生维护成本高**：config plugin、prebuild、真机调试、双端行为一致性
- **触发阈值**：当前阶段 1+2 后，300 张上限下启动扫描约 5~20 页轻量读取（毫秒级），万张级才需要阶段 3
- **替代方案**：若照片量增长但未达万张（≤5000），可先做「物化结果内存/磁盘缓存 + 增量失效」（纯 JS，成本远低于原生模块），作为阶段 3 的降级选项
- 决策点（实施前需确认）：是否接受引入 config plugin 与 prebuild 流程（当前项目使用 `expo run:ios` 开发构建）
