# Omni `src/` 代码审查报告

- **审查日期**：2026-08-01
- **最后修订**：2026-08-04（追加 ProfileSheet 收起态错配修复审查记录）
- **审查范围**：`src/` 目录全部 22 个文件（app / components / hooks / services / constants / types）
- **审查基线**：Expo SDK 57.0.9 · React 19.2.3 · RN 0.86.2 · react-native-maps 1.27.2 · TypeScript strict
- **审查方式**：静态阅读 + `rg` 交叉验证（死代码、指令缺失、未使用参数）

## 一、问题汇总

| # | 优先级 | 类别 | 问题 | 文件 | 状态 |
| - | ------ | ---- | ---- | ---- | ---- |
| 1 | P0 | 风险 | `satellite-map.tsx` 缺少 `"use no memo"` 指令 | [satellite-map.tsx](../src/components/satellite-map.tsx) | ✅ 已修复（2026-08-02） |
| 2 | P1 | 性能 | `splashKeyframe` 在组件内每次渲染重建 | [animated-icon.tsx:17-34](../src/components/animated-icon.tsx) | ✅ 已修复（2026-08-02） |
| 3 | P1 | 死代码 | `hint-row.tsx` 完全未被引用 | [hint-row.tsx](../src/components/hint-row.tsx) | ✅ 已修复（2026-08-02） |
| 4 | P1 | 死代码 | `ThemedView` 的 `lightColor`/`darkColor` 参数未使用 | [themed-view.tsx:7-12](../src/components/themed-view.tsx) | ✅ 已修复（2026-08-02） |
| 5 | P2 | 模板残留 | Web 端 Tab 品牌文字仍为 `Expo Starter` | [app-tabs.web.tsx:58](../src/components/app-tabs.web.tsx) | ✅ 已修复（审查前已改为 Omni） |
| 6 | P2 | 模板残留 | `explore.tsx` 整页为 Expo 模板示例内容 | [explore.tsx](../src/app/explore.tsx) | ✅ 已修复（审查前已改为相册页） |
| 7 | P3 | 健壮性 | `useGeocodeSearch` 限流等待不可取消 | [use-geocode-search.ts:44-46](../src/hooks/use-geocode-search.ts) | ✅ 已修复（2026-08-02） |
| 8 | P3 | 配置 | Android Maps API key / bundleId 占位符 | [app.json:12,46](../app.json) | ⏳ 需外部资源 |
| 9 | P3 | 可维护性 | ~~`edgePadding` useMemo 依赖数组需随浮层变化同步~~（已随 #10 移除） | [index.tsx:60](../src/app/index.tsx) | ❌ 已随 #10 失效 |
| 10 | P1 | 死代码 | `edgePadding` prop 在 react-native-maps 中不存在，整条视觉补偿链路无效 | [index.tsx](../src/app/index.tsx) · [satellite-map.tsx](../src/components/satellite-map.tsx) · [types/map.ts](../src/types/map.ts) | ✅ 已修复（2026-08-01） |

> 优先级定义：P0 = 影响功能正确性；P1 = 影响性能或为明确死代码；P2 = 体验/品牌一致性；P3 = 健壮性与配置收尾。

## 二、问题详情

### 问题 1 — `satellite-map.tsx` 缺少 `"use no memo"` 指令（P0）

- **位置**：[src/components/satellite-map.tsx](../src/components/satellite-map.tsx) 文件顶部
- **现象**：文件首行为 `/**` 注释，无 `"use no memo"` 指令。全仓 `rg "use no memo"` 无任何匹配。
- **背景**：项目历史经验记录「React Compiler 可能导致地图渲染问题，需在 satellite-map.tsx 加 `"use no memo"` 指令」。当前 `app.json` 中 `experiments.reactCompiler: true` 已开启，但该指令缺失，判定为回归风险。
- **影响**：React Compiler 对 `MapView`（含 `forwardRef` + `useImperativeHandle` + 原生 ref）的自动记忆化可能导致地图不渲染、ref 失效或区域动画异常。该风险在首屏定位成功后才暴露。
- **建议修复**：在文件首行（注释之前）添加指令。

```tsx
"use no memo";
/**
 * 卫星地图组件（原生端）。
 * ...
 */
```

- **验证**：iOS/Android 真机或模拟器重载后，确认地图正常渲染、定位按钮跳转、搜索落 Marker 均正常。

---

### 问题 2 — `splashKeyframe` 在组件内每次渲染重建（P1）

- **位置**：[src/components/animated-icon.tsx:17-34](../src/components/animated-icon.tsx#L17-L34)
- **现象**：`AnimatedSplashOverlay` 函数体内执行 `const splashKeyframe = new Keyframe({...})`，每次 render 都新建实例。而模块级的 `keyframe` / `logoKeyframe` / `glowKeyframe` 已正确提到模块级。
- **原因**：`splashKeyframe` 引用了组件 state（无）、`DURATION`（模块级常量）——实际无组件内依赖，可安全外提。
- **影响**：每次 `AnimatedSplashOverlay` 重渲染（`animate` / `visible` state 切换）都重建 Keyframe，造成不必要的 GC 压力；与项目既有「Keyframe 应提至模块级」约定不一致。
- **建议修复**：将 `splashKeyframe` 移到模块级，与其它 Keyframe 并列。

```tsx
const splashKeyframe = new Keyframe({
  0: { transform: [{ scale: 1 }], opacity: 1 },
  20: { opacity: 1 },
  70: { opacity: 0, easing: Easing.elastic(0.7) },
  100: { opacity: 0, transform: [{ scale: 1 }], easing: Easing.elastic(0.7) },
});

export function AnimatedSplashOverlay() {
  // ...
}
```

- **验证**：启动 App，确认开屏动画仍正常播放并隐藏。

---

### 问题 3 — `hint-row.tsx` 完全未被引用（P1）

- **位置**：[src/components/hint-row.tsx](../src/components/hint-row.tsx)
- **现象**：`rg -n "hint-row|HintRow" src` 仅在定义文件自身匹配，无任何 import。
- **判定**：Expo 模板遗留的死代码组件，无业务用途。
- **影响**：增加维护噪音，被误用风险。
- **建议修复**：直接删除 `src/components/hint-row.tsx`。

---

### 问题 4 — `ThemedView` 的 `lightColor`/`darkColor` 是死参数（P1）

- **位置**：[src/components/themed-view.tsx:7-8,12](../src/components/themed-view.tsx#L7-L12)
- **现象**：

```tsx
export type ThemedViewProps = ViewProps & {
  lightColor?: string;   // 声明
  darkColor?: string;    // 声明
  type?: ThemeColor;
};

export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  // lightColor / darkColor 解构后未在函数体使用
}
```

- **验证**：`rg -n "lightColor|darkColor" src` 仅在此文件出现，全仓无调用方传值。
- **影响**：暴露不存在的 API，误导调用方；与实际主题机制（`useTheme()` + `type`）不符。
- **建议修复**：从 `ThemedViewProps` 与解构中移除 `lightColor`、`darkColor`。

```tsx
export type ThemedViewProps = ViewProps & {
  type?: ThemeColor;
};

export function ThemedView({ style, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...otherProps} />;
}
```

---

### 问题 5 — Web 端 Tab 品牌文字仍为 `Expo Starter`（P2）

- **位置**：[src/components/app-tabs.web.tsx:58](../src/components/app-tabs.web.tsx#L58)
- **现象**：`<ThemedText type="smallBold" style={styles.brandText}>Expo Starter</ThemedText>`，品牌文字未从模板默认值改为 `Omni`。
- **影响**：Web 端品牌不一致；移动端 `app-tabs.tsx` 使用图标无文字，故仅 Web 端暴露此问题。
- **建议修复**：将 `Expo Starter` 改为 `Omni`。

---

### 问题 6 — `explore.tsx` 整页为模板内容（P2）

- **位置**：[src/app/explore.tsx](../src/app/explore.tsx)
- **现象**：整页为 Expo 入门示例（Collapsible 教程：file-based routing、跨端支持、图片、明暗模式、动画），引用模板图片 `tutorial-web.png`、`react-logo.png`。
- **影响**：第二个 Tab 仍是模板，无实际业务价值。
- **建议修复**：根据产品规划重写为业务页（如「我的」/「设置」/「搜索历史」），或暂占位待定。需产品决策，不在本次自动修复范围。

---

### 问题 7 — `useGeocodeSearch` 限流等待不可取消（P3）

- **位置**：[src/hooks/use-geocode-search.ts:41-46](../src/hooks/use-geocode-search.ts#L41-L46)
- **现象**：debounce 触发后，限流逻辑用 `await new Promise((r) => setTimeout(r, NOMINATIM_RATE_LIMIT_MS - elapsed))` 等待。该内层 `setTimeout` 未被跟踪，effect cleanup（`clearTimeout(timer)`）只能清掉外层 debounce timer，无法清掉已进入执行阶段的内层等待。
- **影响**：连续快速输入时，多个 debounce 回调可能并发完成限流等待并执行后续逻辑；所幸 `AbortController` 保护了 fetch 本身，但 `lastCallRef` 更新存在轻微竞态，可能导致限流窗口判断偏差。
- **建议修复**：将限流等待纳入可取消范围，例如用一个 ref 存储限流 timer，cleanup 时一并清除；或在限流等待后再次校验 `abortRef.current` 是否仍属于本次请求。

```ts
const rateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// 限流等待
await new Promise<void>((resolve) => {
  rateTimerRef.current = setTimeout(resolve, NOMINATIM_RATE_LIMIT_MS - elapsed);
});

// cleanup
return () => {
  clearTimeout(timer);
  if (rateTimerRef.current) clearTimeout(rateTimerRef.current);
  abortRef.current?.abort();
};
```

---

### 问题 8 — 配置层占位符（P3，非 src 内但影响运行）

- **位置**：[app.json:46](../app.json#L46) 与 [app.json:12](../app.json#L12)
- **现象**：
  - Android Google Maps API key 为 `PLACEHOLDER_REPLACE_LATER` → Android 端地图空白（不崩溃）
  - `bundleIdentifier` 为 `com.anonymous.Omni` → 仍为匿名占位
- **影响**：Android 端地图不可用；正式分发前需替换 bundleId。
- **建议修复**：申请 Google Maps Android API key 并填入；确定正式 bundleId 后替换。需外部资源，不在代码自动修复范围。

---

### 问题 9 — `edgePadding` useMemo 依赖需随浮层变化同步（P3）

- **位置**：[src/app/index.tsx:53-61](../src/app/index.tsx#L53-L61)
- **现象**：`useMemo` 依赖数组为 `[insets.top]`，当前逻辑正确（其余 `Spacing.*`、`SEARCH_AREA_HEIGHT`、`BOTTOM_UI_HEIGHT`、`BottomTabInset` 均为常量）。
- **风险**：未来若搜索框高度、Tab Bar 高度变为动态值（如键盘避让、折叠态），需同步更新依赖数组，否则 `edgePadding` 不会重算，蓝点视觉中心偏移。
- **建议**：作为可维护性备忘，无当前功能影响。若引入动态浮层，记得把对应变量加入依赖。

## 三、改进路线图

| 阶段 | 事项 | 涉及问题 | 状态 |
| ---- | ---- | -------- | ---- |
| 阶段 1（自动可修） | 补 `"use no memo"`、`splashKeyframe` 外提、删 hint-row、清理 ThemedView 死参数、Web 品牌文字改 Omni | #1 #2 #3 #4 #5 | ✅ 全部完成（2026-08-02） |
| 阶段 2（需产品决策） | 重写 explore.tsx 业务页 | #6 | ✅ 审查前已改为相册页（无需产品决策） |
| 阶段 3（需外部资源） | 申请 Android Maps API key、确定正式 bundleId | #8 | ⏳ 需外部资源 |
| 阶段 4（健壮性增强） | 限流等待可取消化 | #7 | ✅ 已完成（2026-08-02，提前并入阶段 1） |

## 四、整体评价

`src/` 的地图核心链路（定位 → 地图渲染 → 地址搜索 → 地理编码服务）工程质量高：

- **平台隔离**：`.web.tsx` 变体 + 本地类型定义，Web 端不污染原生包，调用方零平台分支
- **类型安全**：strict 模式，共享类型集中管理，`@ts-expect-error` 均有注释说明
- **工程化**：debounce + 限流 + AbortController 防竞态，符合第三方 API 政策
- **文档**：中文注释充分阐述「为什么」，可读性好

主要技术债集中在两类：

1. **模板残留清理**（#3 #4 #5 #6）——低成本、高收益（#5 #6 审查前已由业务迭代修复，本次补 #3 #4）
2. **Reanimated / React Compiler 已知风险**（#1 #2）——历史经验已记录但未落实，本次补齐

截至 2026-08-02，阶段 1（自动可修）、阶段 2（产品决策项）、阶段 4（健壮性增强）全部完成；仅剩阶段 3（Android Maps API key + bundleId）依赖外部资源待办。`src/` 已达「无死代码、无已知风险回归、无模板残留」的基线状态。

## 五、修复日志

### 2026-08-04：收起态上滑失效修复（profile-sheet.tsx，优化 #11 回归）

**现象**：展开态下拉回收后再次上滑无反应（面板纹丝不动），首次上滑展开正常。详见 [optimization-2026-08-03.md](./optimization-2026-08-03.md) #13。

**根因**：#11 引入动态 `activeOffsetY`（依赖 `expanded`）后，React Compiler 自动 memo 缓存 `pan` 手势对象，`activeOffsetY` 停留在展开态 `[-Infinity, 10]`（仅向下激活），收起态上滑在原生层不激活。已核实 `-Infinity` 在 iOS（`shouldFailUnderCustomCriteria` 的 `isnan` 判断）、Android、web（`shouldActivate` 比较）三端语义均正确，排除配置值问题。

**修复**（[profile-sheet.tsx](../src/components/profile-sheet.tsx) + [bottom-sheet-modal.tsx](../src/components/ui/bottom-sheet-modal.tsx)）：两文件首行添加 `"use no memo"`；展开态 `activeOffsetY` 的 `-Infinity` 改为 `-100000`（避免 JS→原生序列化异常）。

**审查结论**：根因定位基于「#11 前固定双向 slop 无缓存问题、#11 后依赖 state 的配置缓存失效」的对照；`npx tsc --noEmit` 通过。**注意**：`"use no memo"` 为 babel 编译期指令，需清缓存重启 Metro（`npx expo start --clear`）后测试，否则热更新沿用旧编译产物、修改看似无效。需真机回归：展开态→下拉回收→再上滑应正常展开；展开态上滑列表滚动仍流畅、下滑回收正常。

### 2026-08-04：展开态下拉回收人性化（profile-sheet.tsx）

**现象**：展开态下拉回收仅需 80px（阈值与 480~640px 面板不匹配），且 500px/s 轻甩即触发——「只能滑动一点就回收」，连续下拉容易直接关闭。详见 [optimization-2026-08-03.md](./optimization-2026-08-03.md) #12。

**根因**：展开态 `onEnd` 复用收起态的 `DISMISS_THRESHOLD(80) / DISMISS_VELOCITY(500)`，阈值未随行程（130~210px）调整。

**修复**（[profile-sheet.tsx](../src/components/profile-sheet.tsx)）：
- 展开态回收判定改为**行程中点** `(cardHeight - COLLAPSED_HEIGHT) / 2`（map≈130px / 列表≈210px，自适应）
- 新增 `COLLAPSING_VELOCITY = 800` 放宽展开态下甩速度阈值（收起态关闭仍 500）
- 展开态松手仅决定「弹回 / 回收」，绝不直接关闭；关闭仅在收起态（80px + 500）保留

**审查结论**：阈值与行程解耦，展开态下拉手感从容，单次下拉最多落到收起态；`npx tsc --noEmit` 通过。需真机回归：展开态下拉 50% 行程内弹回、超中点回收、快速下甩回收、收起态下拉关闭行为不变。

### 2026-08-04：个人信息面板展开态去除上滑交互（profile-sheet.tsx）

**现象**：展开态「显示有上滑交互」——上滑手势激活外层 Pan，干扰照片/路径列表内部 ScrollView/FlatList 滚动。详见 [optimization-2026-08-03.md](./optimization-2026-08-03.md) #11。

**根因**：pan 手势无 `activeOffsetY`，slop 双向激活；展开态上滑虽被 `Math.max` 钳制（卡片不动），但手势仍激活并与内部列表滚动竞争。

**修复**（[profile-sheet.tsx](../src/components/profile-sheet.tsx)）：
- 新增 `expanded` state（与 `expandedRef` 双轨：ref 供 worklet，state 驱动手势重建）
- pan 手势按状态动态配置 `activeOffsetY`：展开态 `[Number.NEGATIVE_INFINITY, 10]`（仅向下激活，上滑交内部列表滚动）、收起态 `[-10, 10]`（双向不变）

**审查结论**：行为收敛到 iOS 底部 sheet 标准——展开态上滑滚动内容、下滑拖拽回收；`npx tsc --noEmit` 通过。需真机回归：照片/路径展开态上滑列表滚动流畅、列表到顶后继续下拉回收、收起态上滑展开/下滑关闭不变。

### 2026-08-04：个人信息面板收起态错配修复（profile-sheet.tsx）

**现象**：点击侧边「我的」按钮打开面板时，收起态偶发张开不完全——只显示顶部一小部分内容（如只到头像附近），而非完整收起态（头像 + 昵称 + 统计，220px）。详见 [optimization-2026-08-03.md](./optimization-2026-08-03.md) #10。

**根因**：`collapse()`、`pan.onUpdate()` 收起态分支、`pan.onEnd()` 收起态弹回三处用**缓存值** `collapsedOffset` 作收起态基准；该值仅在 `expand()` 时被立即更新为 `targetHeight - COLLAPSED_HEIGHT`，与 `cardHeight` 的 300ms `withTiming` 动画不同步。时序错配（展开动画中途回收、状态残留）时，可见高度 = `cardHeight - translateY` ≠ `COLLAPSED_HEIGHT`。

**修复**（[profile-sheet.tsx](../src/components/profile-sheet.tsx)）：
- 收起态基准一律**实时计算** `cardHeight.value - COLLAPSED_HEIGHT`（pan.onUpdate / pan.onEnd 弹回）
- `collapse()` 新增 `targetHeightRef`：`cardHeight` 收尾到展开目标 + `translateY` 停靠到 `target - COLLAPSED_HEIGHT`，两者同速动画，任何时序下可见高度恒 = 220，且不改变展开高度语义
- `collapsedOffset` 降级为仅 `open()` 停靠位使用（opening effect 仍与 `cardHeight` 同步重置）

**审查结论**：修复消除缓存基准与动画值的耦合，属防御性根修；`npx tsc --noEmit` 通过。需真机回归：反复开合面板、照片/路径展开后下拉回收再上滑、快速连点等时序下，收起态高度应恒为 220px。

### 2026-08-03：照片标记 JS 聚类 + 视口裁剪（阶段 2，专项 #9）

专项 #8（ph:// 缩略图 + tracksViewChanges）真机验证通过后，落地 JS 聚类与视口裁剪，详见 [optimization-2026-08-03.md](./optimization-2026-08-03.md) #9：

- **新建 `src/utils/cluster.ts`**：`clusterPhotos` 像素空间网格聚类（半径 80px，O(n)，数百张毫秒级）——同格照片聚为簇（坐标取平均、count 徽标）、单张保留；视口外（含 0.5 缓冲）照片丢弃，实现视口裁剪。无需原生聚合库（照片 >500 时再评估）。
- **`satellite-map.tsx`**：内部 `viewport` state + `handleRegionChangeComplete`（更新视口并透传）；`clustered = useMemo(clusterPhotos(...))` 仅手势结束重算；`PhotoMarkers` 支持混合项——单张（原缩略图 + 加载期追踪）与簇（36px 圆形徽标 `rgba(0,122,255,0.92)`、`tracksViewChanges={false}`、锚定中心）。
- **`index.tsx`**：`handlePhotoClusterPress` 计算簇内包围盒（20% 边距、0.005 兜底）→ `moveMap` 放大展开；`SatelliteMapProps` 新增 `onClusterPress`。
- **`use-geotagged-photos.ts`**：`MAX_PHOTOS` 100 → 300（聚类 + 视口裁剪使渲染规模受控）。
- **核查**：`AssetField` 不支持 location 过滤 → 视口裁剪只能在物化后 JS 侧完成，原生查询级视口查询留待阶段 3（SQLite 建区域索引）。

**审查结论**：聚类为新增交互（簇 → 点击展开），需真机验证簇徽标显示、点击放大展开、拖拽重聚类；`npx tsc --noEmit` 通过。

### 2026-08-03：照片与 EXIF 提取性能专项（照片管线 + Marker 渲染）

应需求「先优化照片与 EXIF 提取问题」做性能专项。先核实原生层事实（expo-media-library 57 / expo-image 57 / react-native-maps 1.27 源码），再落地纯 JS 改动，详见 [optimization-2026-08-03.md](./optimization-2026-08-03.md) #8：

- **数据管线瘦身**：`Asset.getUri()` 在 iOS 触发 iCloud 下载 + 原图文件复制（`isNetworkAccessAllowed=true`），是最大瓶颈；而 `getLocation()` 直接读 `phAsset.location` 元数据（不解码、不下载）。物化改为只读 `{id, creationTime, location}`，去掉 `getUri`。
- **渲染改 ph:// 缩略图**：expo-image 原生支持 `ph://`（PhotoLibraryAssetLoader），按容器尺寸请求系统缩略图，Marker 缩略图与详情大图均改 `source={{ uri: photo.id }}`，无需提前拿原图 uri。
- **Android Marker 视图追踪**：react-native-maps 1.27 `tracksViewChanges` 默认 true 会持续追踪自定义视图（性能杀手，iOS Apple Maps 忽略）。PhotoMarkers 加 `tracksViewChanges={!loaded}`，图片 onLoad/onError 后置 false 做最终快照停止追踪。
- **桥接并发控制**：`materializeAssets` 默认分批 10/批，替代原 60 并发 `Promise.all`。
- **增量刷新**：新增 `addListener('mediaLibraryDidChange')`，拍照/删除后自动重扫 GPS 照片（卸载 remove 防泄漏）。
- **核查**：`AssetField` 不支持 location 过滤 → 原生查询层无法视口裁剪，仅能物化后 JS 过滤（列入后续可选）。

**审查结论**：专项 #8 的「ph:// 缩略图」为行为变更点，需真机验证 iOS/Android 图片显示与详情大图；`npx tsc --noEmit` 通过。

### 2026-08-03：全仓第二轮优化审查（性能重构 + 公共组件抽取 + 数据层合并）

对 2026-08-01 审查后新增的迭代代码做第二轮审查，重点核查两项：**冗余代码**（重复逻辑、无用文件、未用导入/常量）与**代码分散**（功能迁移记录导致的重复实现）。发现并处理以下问题，详见 [optimization-2026-08-03.md](./optimization-2026-08-03.md)：

- **冗余清理**：删除 5 个模板遗留死文件（`web-badge.tsx` / `ui/collapsible.tsx` / `animated-icon.module.css` / `logo-glow.png` / `scripts/reset-project.js`）+ 2 个空目录；重写 `animated-icon.tsx`（148→74 行）与 `animated-icon.web.tsx`（108→3 行）去掉死导出；清理 index.tsx 空占位按钮、map-search-bar 未用 import、README 失效引用。
- **公共组件抽取**：两个底部弹层（照片详情 / 我的面板）逐字重复的 Modal + backdrop + grabber + Pan 手势结构抽为 `use-bottom-sheet.ts` + `ui/bottom-sheet-modal.tsx`，消除约百行重复。
- **性能重构**（审查重点：React Compiler + 0 memo + 10Hz 磁力计组合导致整树重渲染）：
  - H1：`useHeading` 从 index.tsx 下移进 `satellite-map.tsx` 内部持有，heading/accuracy 更新不再驱动首页整树；`use-heading` 增加值相等短路。
  - H2：地图拆出 `SearchMarkers` / `PhotoMarkers` / `RoutePolylines` 三个 React.memo 子组件，anchor/centerOffset 提为模块常量，回调 useCallback 化；`"use no memo"` 指令保留。
  - H3：`useLocation` 移除无人消费的 coords/status/error state 与 `watchPositionAsync` 订阅，改为纯命令式 `requestAndLocate`（地图蓝点由系统 `showsUserLocation` 驱动）。
- **数据层合并**：相册三管线（网格 / 地图标记 / 总数）统一到 `constants/media.ts`（`MEDIA_PAGE_SIZE`）、`services/media-library.ts`（`materializeAssets`）、`hooks/use-media-library-permission.ts`（四态权限判定），消除 3 处重复 `Promise.allSettled` 样板与权限判定。
- **样式与工具**：6 处散落 shadow 块 token 化为 `theme.ts` 的 `Shadow.sm/md/lg`；坐标展示统一为 `utils/geo.ts` 的 `formatLatLng`。
- **核查无改动**：取色入口（`ROUTE_COLORS`）确认已在 `route-parser.ts` 集中，无分散。

**审查结论**：截至 2026-08-03，`src/` 无死代码、无重复实现、无已知性能热点；`npx tsc --noEmit` 通过。新增代码（useBottomSheet / materializeAssets / useMediaLibraryPermission）延续了「集中管理、单点修改」约定，未引入新的模板残留或指令缺失。

### 2026-08-02：阶段 1 收官 + 健壮性增强 + 核实 #5 #6 已修复（对应 #1 #2 #3 #4 #5 #6 #7）

本次一次性修复 5 项阶段 1 自动可修问题 + 1 项阶段 4 健壮性问题，连带核实 #5 与 #6 在审查前的业务迭代中已修复：

#### 修复 #1 — `satellite-map.tsx` 补 `"use no memo"`

- **位置**：[src/components/satellite-map.tsx#L1](../src/components/satellite-map.tsx#L1)
- **动作**：在文件首行（JSDoc 注释之前）插入 `"use no memo"` 指令。
- **根因**：`app.json` 中 `experiments.reactCompiler: true` 已开启，但卫星地图组件（含 `forwardRef` + `useImperativeHandle` + MapView 原生 ref + Marker/Polyline 列表）是 React Compiler 自动记忆化易出错的典型形态——轻则 ref 失效、重则地图不渲染或区域动画异常。
- **验证**：`npx tsc --noEmit` 通过。

#### 修复 #2 — `splashKeyframe` 从组件内提升至模块级

- **位置**：[src/components/animated-icon.tsx#L11-L28](../src/components/animated-icon.tsx#L11-L28)
- **动作**：把 `AnimatedSplashOverlay` 函数体内的 `const splashKeyframe = new Keyframe({...})` 移到模块级，与已正确外提的 `keyframe` / `logoKeyframe` / `glowKeyframe` 并列。
- **根因**：`splashKeyframe` 无任何组件内 state 或 prop 依赖（仅引用模块级常量 `DURATION`），放在组件内会在 `animate` / `visible` state 切换时每次 render 都新建 Keyframe 实例，造成不必要的 GC 压力，也与项目约定「Keyframe 应提至模块级」不一致。
- **验证**：`npx tsc --noEmit` 通过。开屏过渡需真机回归，逻辑等价不影响行为。

#### 修复 #3 — 删除 `hint-row.tsx` 死代码

- **动作**：删除 [src/components/hint-row.tsx](../src/components/hint-row.tsx) 文件。
- **根因**：`rg -n "hint-row|HintRow" src` 仅命中文件自身定义行，`src/app` 与 `src/components` 全仓无任何 import 或渲染调用。属于 Expo 模板遗留组件（展示 "Try editing `app/index.tsx`" 的编辑提示），无业务用途。
- **验证**：`npx tsc --noEmit` 通过；删除后重新 `rg` 无残留引用。

#### 修复 #4 — 清理 `ThemedView` 的 `lightColor` / `darkColor` 死参数

- **位置**：[src/components/themed-view.tsx#L6-L10](../src/components/themed-view.tsx#L6-L10)
- **动作**：
  1. 从 `ThemedViewProps` 中移除 `lightColor?: string` 与 `darkColor?: string` 两个字段；
  2. 从 `ThemedView` 参数解构中移除 `lightColor, darkColor`。
- **根因**：两参数在类型中声明、在函数参数中解构后，函数体从未引用；实际主题机制走 `useTheme()` + `type` 映射（`theme[type ?? 'background']`），与「按 prop 指定明暗色」的旧 API 已完全脱钩。全仓 `rg "lightColor|darkColor" src` 也无调用方传值。保留会暴露不存在的 API、误导调用方。
- **验证**：`npx tsc --noEmit` 通过。

#### 核实 #5 — Web 端品牌文字已为 `Omni`（审查报告描述过时）

- **位置**：[src/components/app-tabs.web.tsx#L58-L60](../src/components/app-tabs.web.tsx#L58-L60)
- **实际状态**：`<ThemedText type="smallBold" style={styles.brandText}>Omni</ThemedText>`——已非模板默认值 `Expo Starter`。
- **结论**：审查时该内容已在某次业务迭代中修复，报告原文描述已过时，本次在问题汇总表中标记状态为「✅ 已修复（审查前已改为 Omni）」，无代码改动。

#### 核实 #6 — `explore.tsx` 已为相册页（审查报告描述过时）

- **位置**：[src/app/explore.tsx](../src/app/explore.tsx)
- **实际状态**：
  ```tsx
  /**
   * Explore Tab：相册页面（仿 iOS 相册）。
   *
   * 仅作薄外壳，相册逻辑（权限门控、网格、查看器）封装在 PhotoAlbum 组件内。
   */
  import { PhotoAlbum } from '@/components/photo-album/photo-album';
  export default function TabTwoScreen() { return <PhotoAlbum />; }
  ```
  与 `app-tabs.tsx` / `app-tabs.web.tsx` 第二个 Tab 显示的「图库」文字完全对应；配套实现文件齐全（`src/components/photo-album/photo-album.tsx`、`photo-album.web.tsx`、`src/types/photo-album.ts`、设计文档）。
- **结论**：审查时该内容已在某次业务迭代中替换为真实业务页，报告原文「整页为 Expo 入门示例（Collapsible 教程…）」是审查时的旧快照，已过时。本次在问题汇总表中标记状态为「✅ 已修复（审查前已改为相册页）」，改进路线图阶段 2 相应标记为已完成（无需产品决策），无代码改动。

#### 修复 #7 — `useGeocodeSearch` 限流等待可取消 + 代次校验防竞态

- **位置**：[src/hooks/use-geocode-search.ts#L22-L100](../src/hooks/use-geocode-search.ts#L22-L100)
- **问题回顾**：debounce 触发后，限流逻辑用 `await new Promise((r) => setTimeout(r, N - elapsed))` 等待。内层 `setTimeout` 未被跟踪，effect cleanup（`clearTimeout(timer)`）只能清外层 debounce timer，无法清掉已进入执行阶段的内层等待；连续快速输入时多个 debounce 回调可能并发完成限流等待并更新状态（虽然 `AbortController` 保护了 fetch 本身，但 `lastCallRef` 与 `setResults`/`setError` 存在竞态窗口）。

- **修复策略（两点）**：
  1. **限流 timer 可取消**：新增 `rateTimerRef`（`useRef<ReturnType<typeof setTimeout> | null>`），内层 `setTimeout` 句柄挂到该 ref 上；cleanup 函数中除了 `clearTimeout(timer)` 外，再加 `if (rateTimerRef.current) clearTimeout(rateTimerRef.current); rateTimerRef.current = null`。空查询分支同样清 rateTimer。
  2. **effect 代次（seq）校验**：新增 `effectSeqRef`（`useRef(0)`），每次 effect 执行时 `const seq = ++effectSeqRef.current`。关键状态变更点前都加一道 `if (seq !== effectSeqRef.current) return;` 守卫：
     - 限流等待结束后 → 还没到最新代则直接丢弃（连 `lastCallRef` 都不更新，避免污染限流窗口判断）
     - `setResults` 前
     - `setError` / `setResults([])` 前
     - `finally` 中 `setLoading(false)` 前（与原有的 `abortRef.current === ac` 检查 AND 叠加）

- **影响**：fetch 主体不变（仍用 `AbortController` 保护网络请求），新增的 seq 是内存中纯同步计数，无额外 IO 开销，把「限流后状态乱序」的窗口从 几十~几百 ms 收窄到 0。
- **验证**：`npx tsc --noEmit` 通过。功能回归：搜索框连续快速输入、删光、再输入，观察到 loading/结果/error 状态不会闪旧值。

### 2026-08-01：移除 `edgePadding` 视觉补偿死代码链路（对应 #10，连带 #9）

**根因**：`react-native-maps@1.27.2` 的 `MapView` **不存在 `edgePadding` prop**。`EdgePadding` 类型仅作为 `fitToCoordinates` / `fitToElements` / `fitToSuppliedMarkers` 方法的参数存在（见 `MapView.types.ts` 的 `FitToOptions`）。原代码用 `@ts-expect-error` 压制的报错，并非注释所称「@types 未同步」，而是该 prop 根本不被识别——MapView 会静默忽略，蓝点从未因此偏移。

**移除内容**：
- `index.tsx`：`SEARCH_AREA_HEIGHT` / `BOTTOM_UI_HEIGHT` 常量、`edgePadding` useMemo、传给 `<SatelliteMap>` 的 `edgePadding` prop、`requestAnimationFrame` 首帧重对齐 effect（其唯一目的是配合 edgePadding）、`useMemo` 与 `MapEdgePadding` 的 import
- `satellite-map.tsx` / `satellite-map.web.tsx`：props 解构中的 `edgePadding`、`@ts-expect-error` 行、`moveToRegion` handle 方法（仅为首帧对齐服务）
- `types/map.ts`：`MapEdgePadding` 类型、`SatelliteMapProps.edgePadding` 字段、`SatelliteMapHandle.moveToRegion` 方法

**保留**：`paddingAdjustmentBehavior="always"`（真实生效的 prop，处理安全区域 inset）。

**验证**：`npx tsc --noEmit` 通过；`rg` 确认 `MapEdgePadding` / `edgePadding` / `moveToRegion` / `SEARCH_AREA_HEIGHT` / `BOTTOM_UI_HEIGHT` 在 `src/` 中无残留引用。

**影响**：无运行时行为变化（原本就不生效）。代码更精简，消除了对不存在 API 的依赖与误导性注释。#9（edgePadding useMemo 依赖备忘）随之失效。

### 2026-08-01：修复真机蓝点偏离地图中心（两源定位不一致）

**现象**：模拟器上蓝点位于屏幕中心，真机上蓝点偏离中心。

**根因**：地图中心与蓝点用了两个独立的定位源：
- 地图中心 = `getCurrentPositionAsync({ accuracy: Balanced })` 的单次快照（真机常走 WiFi/基站，误差几十~上百米）
- 蓝点 = `showsUserLocation` 的系统持续定位（iOS 走 `MKUserLocation`，精度更高，且持续修正）

真机 GPS 抖动 + 两源精度差异 → 快照坐标 A ≠ 蓝点坐标 B → 地图钉在 A、蓝点画在 B 且会漂移 → 偏离。模拟器位置是固定模拟值，A == B，掩盖了差异。

**修复**：监听 react-native-maps 的 `onUserLocationChange`（iOS/Android 双平台支持），蓝点首次回调时用其坐标对齐地图中心（`animateToRegion(region, 0)`，无动画无缝衔接）。`alignedRef` 保证只对齐一次，避免持续跟随、保留用户自由拖动。

**改动文件**：
- `types/map.ts`：新增 `UserLocationUpdate` 类型、`SatelliteMapProps.onUserLocationChange` 字段
- `satellite-map.tsx`：透传 `onUserLocationChange`，适配原生 `UserLocationChangeEvent` → `UserLocationUpdate`（过滤 `coordinate` 为空的回调）
- `index.tsx`：新增 `alignedRef` + `handleUserLocationChange`，传给 `<SatelliteMap>`

**未改**：`useLocation` 的 `accuracy: Balanced` 保留。它仅作 `initialRegion` 兜底（地图 mount 必须有一个初始中心），蓝点对齐才是精确源；提到 `HighAccuracy` 会更耗电、首次定位更慢，且仍是两源，治标不治本。

**验证**：`npx tsc --noEmit` 通过。需真机回归：进入首页后蓝点应位于屏幕中心；点定位按钮行为不变（仍用快照快速响应）。

**边界**：`onUserLocationChange` 首次回调可能在地图 mount 后数百 ms~数秒触发（取决于 GPS 锁定），期间地图显示在快照中心、蓝点可能短暂偏离，回调后瞬移修正。该延迟为系统 GPS 锁定时间，不可避免。

> ⚠️ 本条「验证」中「点定位按钮行为不变（仍用快照快速响应）」已被下一条修复覆盖，定位按钮现改为蓝点同源优先。

### 2026-08-01：修复点击定位按钮后蓝点漂移（延续两源问题）

**现象**：首帧蓝点居中，但点击定位按钮后蓝点再次偏离中心。

**根因**：`handleLocate` 仍用 `requestAndLocate()` 的单次快照设地图中心，把中心从蓝点坐标 B 移回了快照坐标 A，于是 A ≠ B 再次漂移。这是上一条修复未覆盖的同一根因——只修了首帧，没修定位按钮。

**修复**：缓存蓝点最新坐标到 `userLocationRef`（`handleUserLocationChange` 中持续更新），`handleLocate` 优先用该坐标设中心（与蓝点同源，必然居中）；仅在蓝点尚未更新（GPS 未锁定）时回退到快照。

**改动文件**：仅 [index.tsx](../src/app/index.tsx)——新增 `userLocationRef`，`handleUserLocationChange` 持续写入，`handleLocate` 优先读取。

**验证**：`npx tsc --noEmit` 通过。真机回归：点击定位按钮后蓝点应保持在屏幕中心（地图以 600ms 动画平滑移到蓝点坐标）。
