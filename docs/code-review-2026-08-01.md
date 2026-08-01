# Omni `src/` 代码审查报告

- **审查日期**：2026-08-01
- **审查范围**：`src/` 目录全部 22 个文件（app / components / hooks / services / constants / types）
- **审查基线**：Expo SDK 57.0.9 · React 19.2.3 · RN 0.86.2 · react-native-maps 1.27.2 · TypeScript strict
- **审查方式**：静态阅读 + `rg` 交叉验证（死代码、指令缺失、未使用参数）

## 一、问题汇总

| # | 优先级 | 类别 | 问题 | 文件 |
| - | ------ | ---- | ---- | ---- |
| 1 | P0 | 风险 | `satellite-map.tsx` 缺少 `"use no memo"` 指令 | [satellite-map.tsx](../src/components/satellite-map.tsx) |
| 2 | P1 | 性能 | `splashKeyframe` 在组件内每次渲染重建 | [animated-icon.tsx:17-34](../src/components/animated-icon.tsx) |
| 3 | P1 | 死代码 | `hint-row.tsx` 完全未被引用 | [hint-row.tsx](../src/components/hint-row.tsx) |
| 4 | P1 | 死代码 | `ThemedView` 的 `lightColor`/`darkColor` 参数未使用 | [themed-view.tsx:7-12](../src/components/themed-view.tsx) |
| 5 | P2 | 模板残留 | Web 端 Tab 品牌文字仍为 `Expo Starter` | [app-tabs.web.tsx:58](../src/components/app-tabs.web.tsx) |
| 6 | P2 | 模板残留 | `explore.tsx` 整页为 Expo 模板示例内容 | [explore.tsx](../src/app/explore.tsx) |
| 7 | P3 | 健壮性 | `useGeocodeSearch` 限流等待不可取消 | [use-geocode-search.ts:44-46](../src/hooks/use-geocode-search.ts) |
| 8 | P3 | 配置 | Android Maps API key / bundleId 占位符 | [app.json:12,46](../app.json) |
| 9 | P3 | 可维护性 | ~~`edgePadding` useMemo 依赖数组需随浮层变化同步~~（已随 #10 移除） | [index.tsx:60](../src/app/index.tsx) |
| 10 | P1 | 死代码 | `edgePadding` prop 在 react-native-maps 中不存在，整条视觉补偿链路无效（已修复） | [index.tsx](../src/app/index.tsx) · [satellite-map.tsx](../src/components/satellite-map.tsx) · [types/map.ts](../src/types/map.ts) |

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

| 阶段 | 事项 | 涉及问题 |
| ---- | ---- | -------- |
| 阶段 1（自动可修） | 补 `"use no memo"`、`splashKeyframe` 外提、删 hint-row、清理 ThemedView 死参数、Web 品牌文字改 Omni | #1 #2 #3 #4 #5 |
| 阶段 2（需产品决策） | 重写 explore.tsx 业务页 | #6 |
| 阶段 3（需外部资源） | 申请 Android Maps API key、确定正式 bundleId | #8 |
| 阶段 4（健壮性增强） | 限流等待可取消化 | #7 |

## 四、整体评价

`src/` 的地图核心链路（定位 → 地图渲染 → 地址搜索 → 地理编码服务）工程质量高：

- **平台隔离**：`.web.tsx` 变体 + 本地类型定义，Web 端不污染原生包，调用方零平台分支
- **类型安全**：strict 模式，共享类型集中管理，`@ts-expect-error` 均有注释说明
- **工程化**：debounce + 限流 + AbortController 防竞态，符合第三方 API 政策
- **文档**：中文注释充分阐述「为什么」，可读性好

主要技术债集中在两类：

1. **模板残留清理**（#3 #4 #5 #6）——低成本、高收益
2. **Reanimated / React Compiler 已知风险**（#1 #2）——历史经验已记录但未落实，需优先修复

修复阶段 1 全部 5 项后，`src/` 即可达到「无死代码、无已知风险回归」的基线状态。

## 五、修复日志

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
