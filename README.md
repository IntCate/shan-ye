# Omni

基于 [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) 构建的跨平台应用，支持 iOS、Android 与 Web。采用 Expo Router 文件路由、React 19、TypeScript 严格模式，内置明暗主题、平台差异化组件与 Reanimated 动画。

> ⚠️ 工程约束：编写任何代码前，必须查阅 [Expo v57.0.0 版本文档](https://docs.expo.dev/versions/v57.0.0/)。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | Expo `~57.0.9`、React Native `0.86.2`、React `19.2.3` |
| 路由 | Expo Router `~57.0.9`（文件路由 + `typedRoutes` + `reactCompiler` 实验特性） |
| 语言 | TypeScript `~6.0.3`（`strict: true`） |
| 动画 | `react-native-reanimated` 4.5.1 + `react-native-worklets` 0.10.1 |
| UI | `@expo/ui`、`expo-image`、`expo-symbols`、`expo-glass-effect` |
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
    │   ├── _layout.tsx      # 根布局：ThemeProvider + AnimatedSplashOverlay + AppTabs
    │   ├── index.tsx        # Home 屏幕
    │   └── explore.tsx      # Explore 屏幕
    ├── components/          # UI 组件（.web.tsx 为 Web 平台特定版本）
    │   ├── app-tabs.tsx / .web.tsx          # 原生 NativeTabs / Web Tabs
    │   ├── animated-icon.tsx / .web.tsx     # 启动动画与图标
    │   ├── themed-text.tsx                  # 主题化文本
    │   ├── themed-view.tsx                  # 主题化容器
    │   ├── hint-row.tsx                     # 提示行
    │   ├── web-badge.tsx                    # Web 端版本徽标
    │   ├── external-link.tsx                # 应用内浏览器外链
    │   └── ui/collapsible.tsx               # 可折叠面板
    ├── hooks/
    │   ├── use-color-scheme.ts / .web.ts    # 颜色方案（Web 支持水合）
    │   └── use-theme.ts                     # 主题色取用
    ├── constants/
    │   └── theme.ts         # Colors / Fonts / Spacing / 布局常量
    └── global.css           # Web 字体 CSS 变量
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

### 日常开发

原生工程构建完成后，日常 JS 开发只需启动 Metro：

```bash
npm start          # 即 expo start
```

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

采用 Expo Router 文件路由，约定路由文件位于 `src/app/`。根布局 [_layout.tsx](src/app/_layout.tsx) 注入 `ThemeProvider`（依据系统颜色方案切换明暗主题）并渲染 `AppTabs`。

- [src/app/index.tsx](src/app/index.tsx) — Home 屏幕，展示欢迎信息与开发提示
- [src/app/explore.tsx](src/app/explore.tsx) — Explore 屏幕，含可折叠的功能说明

### 平台差异化

通过 `.web.tsx` 扩展名实现 Web 端差异化实现，Metro 自动按平台解析：

- [app-tabs](src/components/app-tabs.tsx)：原生端用 `expo-router/unstable-native-tabs` 渲染系统原生标签栏；Web 端用 `expo-router/ui` 的 `Tabs` 渲染顶部导航条
- [animated-icon](src/components/animated-icon.tsx)：原生端有启动 splash 过渡，Web 端无
- [use-color-scheme](src/hooks/use-color-scheme.web.ts)：Web 端增加水合处理以兼容静态渲染

### 主题系统

- [constants/theme.ts](src/constants/theme.ts) 集中定义 `Colors`（light/dark）、`Fonts`（按平台）、`Spacing`、`BottomTabInset`、`MaxContentWidth`
- [use-theme.ts](src/hooks/use-theme.ts) 暴露 `useTheme()` 返回当前颜色方案对应的调色板
- [ThemedText](src/components/themed-text.tsx) / [ThemedView](src/components/themed-view.tsx) 封装主题化基础组件，支持 `type` 变体与 `themeColor` 取色

### 布局约定

移动优先布局：使用 `react-native-safe-area-context` 的 `SafeAreaView` 处理安全区，底部预留 `BottomTabInset`（iOS 50 / Android 80），内容最大宽度 `MaxContentWidth = 800`，居中显示。

### 动画

- [animated-icon.tsx](src/components/animated-icon.tsx) 使用 Reanimated `Keyframe` 实现启动 splash 过渡与图标入场动画，通过 `scheduleOnRN` 在 worklet 中回调主线程
- [ui/collapsible.tsx](src/components/ui/collapsible.tsx) 使用 `FadeIn` 实现折叠展开动画

## 开发约定

- **写代码前必读** [Expo v57.0.0 文档](https://docs.expo.dev/versions/v57.0.0/)（见 [AGENTS.md](AGENTS.md)）
- TypeScript 严格模式，路径别名统一使用 `@/...`
- 平台特定代码使用 `.web.tsx` / `.web.ts` 扩展名分离
- 业务代码置于 `src/`，仅路由与布局文件置于 `src/app/`
- Web 预览推荐使用 Chrome DevTools 设备模式（iPhone 17 Pro，竖屏）

## 故障排查

| 问题 | 解决方案 |
| --- | --- |
| Expo Go 在 iOS 模拟器闪退 | 改用开发构建 `npm run ios`，JSI 库不兼容 Expo Go |
| `pod install` 失败 | `rm -rf ios/` 后重新 `npm run ios` |
| hermes-ios 下载缓慢 | `ENTERPRISE_REPOSITORY=阿里云镜像 npm run ios` |
| Metro 无法连接模拟器 | `xcrun simctl openurl booted exp+omni://` |

## 学习资源

- [Expo 文档](https://docs.expo.dev/)
- [Expo Router 文档](https://docs.expo.dev/router/introduction)
- [Reanimated 文档](https://docs.swmansion.com/react-native-reanimated/)

## License

见 [LICENSE](LICENSE)。
