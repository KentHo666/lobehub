# Plan: 删除 Electron Modifiers，迁移至 Vite Renderer 构建

## Context

Electron Desktop 的 Renderer 层构建，此前依赖 Next.js `output: 'export'`（静态导出），因此需要 `scripts/electronWorkflow/modifiers/` 下 11 个 AST codemod 对源码进行大量转换（动态→静态、移除 server-only 代码、路由裁剪等）。

现已完成 Vite SPA 迁移（见 `spa-plan.md`），Web 端 Renderer 已通过 `vite build` 构建。Electron Renderer 可完全复用此 Vite 构建流程，通过在 `electron-vite` 中增加 `renderer` entry 直接构建，配合 `.desktop` 后缀文件实现桌面端差异化，从而**彻底移除所有 modifier 脚本和 Next.js shadow workspace 构建流程**。

### 核心决策

- **Renderer 构建器**：在 `apps/desktop/electron.vite.config.ts` 增加 `renderer` entry，复用根目录 Vite 插件（`vitePlatformResolve`、`viteNodeModuleStub`、`tsconfigPaths`、`react`），统一由 `electron-vite build` 一次构建 main + preload + renderer
- **HTML 入口**：在 `apps/desktop/` 新增 `index.html`，`<script>` 指向 `../../src/entry.desktop.tsx`
- **差异化机制**：`.desktop` 后缀文件（由 `vitePlatformResolve` 插件自动解析，优先级 `.desktop` → `.vite` → 原始），替代 AST codemod
- **产物结构**：`apps/desktop/dist/renderer/` 内含单个 `index.html` + `assets/`，取代原 `dist/next/` 多页面结构

---

## Phase 1: 删除所有 Modifier 脚本

**目标**：移除 `scripts/electronWorkflow/modifiers/` 整个目录。

### 1.1 删除 modifier 文件

删除以下所有文件：

```
scripts/electronWorkflow/modifiers/
├── index.mts              # 主入口编排器
├── utils.mts              # 通用工具
├── nextConfig.mts         # Next.js 配置改造
├── nextDynamicToStatic.mts # next/dynamic → static import
├── dynamicToStatic.mts    # dynamicElement() → static import
├── i18nDynamicToStatic.mts # i18n 异步→同步映射
├── settingsContentToStatic.mts # Settings 动态→静态
├── wrapChildrenWithClientOnly.mts # ClientOnly 包装
├── removeSuspense.mts     # 移除 Suspense
├── staticExport.mts       # [variants] → (variants)
├── appCode.mts            # 移除 DevPanel/Analytics/Security
├── routes.mts             # 删除后端/认证路由
└── cleanUp.mts            # 移除 'use server'
```

### 1.2 各 Modifier 废弃理由

| Modifier | 原功能 | 废弃理由 |
|---|---|---|
| **nextConfig** | 注入 `output: 'export'`，移除 redirects/headers/PWA | 不再使用 Next.js 构建 Renderer |
| **nextDynamicToStatic** | `next/dynamic()` → 静态 import | SPA 中已无 `next/dynamic`，Vite 原生 code splitting |
| **dynamicToStatic** | `dynamicElement()` → 静态 import | Vite 原生处理 `React.lazy` |
| **i18nDynamicToStatic** | 动态 locale import → 预构建映射表 | `.vite.ts` 文件已通过 `import.meta.glob` 处理 |
| **settingsContentToStatic** | Settings componentMap dynamic → static | Vite 原生处理 `React.lazy` |
| **wrapChildrenWithClientOnly** | 包裹 `<ClientOnly>` | SPA 本就纯客户端渲染 |
| **removeSuspense** | 移除 Suspense 包装 | Suspense 在 Vite SPA 中正常工作 |
| **staticExport** | `[variants]` → `(variants)`，移除 URL rewrite | 不再使用 Next.js 路由 |
| **appCode** | 移除 DevPanel/Security/Analytics/manifest | 由 `.desktop` 后缀文件处理（Phase 3） |
| **routes** | 删除 backend/auth/mobile 路由 | SPA Router 仅包含 `desktopRoutes`，无需裁剪 |
| **cleanUp** | 移除 `'use server'` | `.vite.ts` 文件已绕过 server-only 代码 |

---

## Phase 2: `electron-vite` 增加 Renderer Entry

**目标**：在 `apps/desktop/electron.vite.config.ts` 中增加 `renderer` 配置，复用根目录 Vite 插件，统一由 `electron-vite build` 构建全部三层。

### 2.1 新增 `apps/desktop/index.html`

Electron Renderer 入口 HTML，指向根目录的 `entry.desktop.tsx`：

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script>
      (function () {
        var locale = navigator.language || 'en-US';
        document.documentElement.lang = locale;
        var rtl = ['ar', 'fa', 'he', 'ur'];
        document.documentElement.dir = rtl.indexOf(locale.split('-')[0]) >= 0 ? 'rtl' : 'ltr';
      })();
    </script>
    <div id="root"></div>
    <script>
      window.__SERVER_CONFIG__ = undefined; /* injected by preload */
    </script>
    <script type="module" src="../../src/entry.desktop.tsx"></script>
  </body>
</html>
```

> 注：与根目录 `index.html`（Web SPA 用）类似，但简化了 locale 检测（无 cookie/`?hl=`，Electron 直接用 `navigator.language`），`__SERVER_CONFIG__` 由 preload 注入。

### 2.2 修改 `apps/desktop/electron.vite.config.ts`

增加 `renderer` 配置，复用根目录 Vite 插件：

```typescript
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';

import { getExternalDependencies } from './native-deps.config.mjs';
// 复用根目录的 Vite 插件
import { viteNodeModuleStub } from '../../plugins/vite/nodeModuleStub';
import { vitePlatformResolve } from '../../plugins/vite/platformResolve';

dotenv.config();

const isDev = process.env.NODE_ENV === 'development';
const ROOT_DIR = resolve(__dirname, '../..');

export default defineConfig({
  main: {
    // ... 保持不变
  },
  preload: {
    // ... 保持不变
  },
  renderer: {
    root: __dirname,
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    define: {
      '__MOBILE__': 'false',
      '__ELECTRON__': 'true',
      // NEXT_PUBLIC_IS_DESKTOP_APP 已删除，见 Phase 7
    },
    plugins: [
      viteNodeModuleStub(),
      vitePlatformResolve('desktop'),  // .desktop → .vite → 原始
      tsconfigPaths({ root: ROOT_DIR }),
      react({ jsxImportSource: '@emotion/react' }),
    ],
    resolve: {
      alias: {
        // tsconfigPaths 处理 @/ 映射至根目录 src/
        // 此处可添加额外 alias（如需要）
      },
    },
  },
});
```

**要点**：
- `root: __dirname` — renderer 的根目录为 `apps/desktop/`
- `tsconfigPaths({ root: ROOT_DIR })` — 使用根目录 `tsconfig.json` 的路径映射（`@/` → `src/`）
- `vitePlatformResolve('desktop')` — 解析优先级 `.desktop` → `.vite` → 原始
- `input` 指向 `apps/desktop/index.html`，该 HTML 的 `<script src>` 指向 `../../src/entry.desktop.tsx`

### 2.3 删除旧的独立构建脚本

以下文件不再需要，可直接删除：

```
scripts/electronWorkflow/buildNextApp.mts       # shadow workspace + modifiers + next build
scripts/electronWorkflow/moveNextExports.ts      # 复制 out/ → dist/next/
```

`electron-vite build` 已直接输出到 `apps/desktop/dist/renderer/`，无需中间复制步骤。

### 2.4 更新 `package.json` scripts

```jsonc
{
  // Before:
  // "desktop:build:all": "npm run desktop:build:renderer:all && npm run desktop:build:main",
  // "desktop:build:renderer": "cross-env ... tsx scripts/electronWorkflow/buildNextApp.mts",
  // "desktop:build:renderer:all": "npm run desktop:build:renderer && npm run desktop:build:renderer:prepare",
  // "desktop:build:renderer:prepare": "tsx scripts/electronWorkflow/moveNextExports.ts",

  // After:
  "desktop:build:all": "npm run desktop:build:main",
  // desktop:build:renderer* 全部删除，renderer 构建由 electron-vite build 统一处理
  // apps/desktop/package.json 中 build:main = "electron-vite build" 已同时构建 main + preload + renderer
}
```

`apps/desktop/package.json` 中 `"build:main": "electron-vite build"` 已包含 renderer 构建，根目录只需调用 `desktop:build:main`。

---

## Phase 3: `.desktop` 后缀差异化文件 — 全量等价审计

**目标**：确保每个原 modifier 在 Vite Desktop 构建中都有等价的替代方案。使用 `.desktop` 后缀文件覆盖 `.vite` 版本中行为不等价的模块。

### 3.0 解析优先级

`vitePlatformResolve('desktop')` 解析顺序：`.desktop.ts` → `.vite.ts` → `.ts`。**无需修改插件**。

### 3.1 全量 Modifier 等价性审计

#### 类别 A：关注点已不存在（无需任何替代）

| Modifier | 原操作 | 废弃理由 |
|---|---|---|
| **nextConfig** | 注入 `output: 'export'`，移除 redirects/headers/PWA | Renderer 不再经过 Next.js 构建 |
| **staticExport** | `[variants]` → `(variants)`，移除 URL rewrite | 不再使用 Next.js 路由系统 |
| **wrapChildrenWithClientOnly** | 包裹 `<ClientOnly>` 防 hydration 不匹配 | SPA 纯客户端渲染，无 hydration |
| **removeSuspense** | 移除 Conversation Suspense 包装 | Vite 中 Suspense 正常工作 |
| **routes** | 删除 backend/auth/mobile 路由 | SPA 入口 `entry.desktop.tsx` 仅使用 `desktopRoutes`，不含后端/认证路由 |
| **cleanUp** | 移除 `'use server'` 指令 | `.vite.ts` 文件已绕过 server-only 模块 |

#### 类别 B：已由 `.vite.ts` 等价处理

| Modifier | 原操作 | `.vite.ts` 等价方案 |
|---|---|---|
| **nextDynamicToStatic** | `next/dynamic()` → 静态 import | SPA 中已无 `next/dynamic`，`dynamic.tsx` 已由 `.vite.ts` 替换为 `React.lazy` |
| **dynamicToStatic** | `dynamicElement()` → 静态 import | Vite 原生支持 `React.lazy` code splitting，`dynamicElement` 正常工作 |
| **settingsContentToStatic** | Settings componentMap `dynamic()` → 静态 import | Vite 原生 `React.lazy` 正常处理 Settings tab 懒加载 |

#### 类别 C：`.vite.ts` 行为不等价，需要 `.desktop.ts` 覆盖

| Modifier | 原操作 | `.vite.ts` 现状 | 不等价原因 | `.desktop.ts` 方案 |
|---|---|---|---|---|
| **i18nDynamicToStatic** (namespace) | 全量静态 import 所有 locale JSON，同步查表 | `import.meta.glob` 懒加载（async） | Desktop 本地运行，async 增加启动延迟且无必要；原 modifier 是同步的 | `import.meta.glob({ eager: true })` 同步预加载 |
| **i18nDynamicToStatic** (UI resources) | 全量静态 import 所有 UI locale JSON，同步查表 | `import.meta.glob` 懒加载（async） | 同上 | `import.meta.glob({ eager: true })` 同步预加载 |
| **i18nDynamicToStatic** (antd locale) | 随 i18n 整体静态化 | `import.meta.glob` 懒加载（async） | 同上 | `import.meta.glob({ eager: true })` 同步预加载 |
| **i18nDynamicToStatic** (dayjs locale) | 随 i18n 整体静态化 | `import.meta.glob` 懒加载（async） | 同上 | `import.meta.glob({ eager: true })` 同步预加载 |

#### 类别 D：`appCode.mts` 各项处置

| 原操作 | 现状 | 需要 `.desktop`？ |
|---|---|---|
| 替换 page.tsx 为 desktop-only | SPA 入口 `entry.desktop.tsx` 直接使用 `desktopRoutes` | **否** |
| 移除 DevPanel | SPAGlobalProvider 已注释 DevPanel（`node:fs` 不可用） | **否** |
| 删除 Security 目录 | SPA Router 不含 security 路由（不可达） | **否** |
| 移除 Security tab 引用 | 需确认 `desktopRoutes` 是否包含 security 路由。若不包含则不可达，无需处理 | **待确认** |
| 移除 SpeedInsights/Analytics | SPAGlobalProvider 不含 SpeedInsights；Analytics 由 `.vite.tsx` 处理 | **否** |
| 替换 mdx/Image | `Image.vite.tsx` 已移除 `plaiceholder`/`sharp` | **否** |
| 移除 manifest/metadataBase | SPA 无 Next.js metadata | **否** |

### 3.2 需要创建的 `.desktop.ts` 文件（4 个）

#### 3.2a `src/utils/i18n/loadI18nNamespaceModule.desktop.ts`

与 `.vite.ts` 结构相同，但 `import.meta.glob` 使用 `{ eager: true }`：

```typescript
import type {
  LoadI18nNamespaceModuleParams,
  LoadI18nNamespaceModuleWithFallbackParams,
} from './loadI18nNamespaceModule';

// eager: true — 构建时全量内联，运行时同步访问
const defaultModules = import.meta.glob<{ default: Record<string, string> }>(
  '/src/locales/default/*.ts',
  { eager: true },
);
const localeModules = import.meta.glob<{ default: Record<string, string> }>(
  '/locales/*/*.json',
  { eager: true },
);

const getDefaultKey = (ns: string) => `/src/locales/default/${ns}.ts`;
const getLocaleKey = (lng: string, ns: string) => `/locales/${lng}/${ns}.json`;

export const loadI18nNamespaceModule = async (
  params: LoadI18nNamespaceModuleParams,
): Promise<{ default: Record<string, string> }> => {
  const { defaultLang, normalizeLocale, lng, ns } = params;

  if (lng === defaultLang) {
    const mod = defaultModules[getDefaultKey(ns)];
    if (!mod) throw new Error(`Missing default namespace: ${ns}`);
    return mod;  // 同步返回，无需 await
  }

  const normalizedLng = normalizeLocale(lng);
  const localeMod = localeModules[getLocaleKey(normalizedLng, ns)];
  if (localeMod) return localeMod;

  const defaultMod = defaultModules[getDefaultKey(ns)];
  if (!defaultMod) throw new Error(`Missing default namespace: ${ns}`);
  return defaultMod;
};

// ... loadI18nNamespaceModuleWithFallback 同理
```

> **关键差异**：`import.meta.glob({ eager: true })` 返回 `Record<string, Module>` 而非 `Record<string, () => Promise<Module>>`。Vite 构建时将所有 locale JSON 内联到 bundle 中，运行时同步访问。等价于原 modifier 生成的 `staticLocaleNamespaceMap`。

#### 3.2b `src/utils/locale.desktop.ts`

```typescript
import { normalizeLocale } from '@/locales/resources';

// eager: true — antd locale 全量内联
const antdLocaleModules = import.meta.glob(
  '/node_modules/antd/es/locale/*.js',
  { eager: true },
);

export const getAntdLocale = async (lang?: string) => {
  let normalLang: any = normalizeLocale(lang);
  if (normalLang === 'ar') normalLang = 'ar-EG';

  const localePath = `/node_modules/antd/es/locale/${normalLang.replace('-', '_')}.js`;
  const mod = antdLocaleModules[localePath];
  if (!mod) throw new Error(`Unsupported antd locale: ${normalLang}`);

  return (mod as any).default;  // 同步访问
};
```

#### 3.2c `src/libs/getUILocaleAndResources.desktop.ts`

```typescript
import { en, zhCn } from '@lobehub/ui/es/i18n/resources/index';
import { normalizeLocale } from '@/locales/resources';

type UILocaleResources = Record<string, Record<string, string>>;

// eager: true — UI locale 全量内联
const uiLocaleModules = import.meta.glob<{ default: UILocaleResources }>(
  '/locales/*/ui.json',
  { eager: true },
);

const getUILocale = (locale: string): string => {
  if (locale.startsWith('zh')) return 'zh-CN';
  if (locale.startsWith('en')) return 'en-US';
  return locale;
};

const loadBusinessResources = (locale: string): UILocaleResources | null => {
  const key = `/locales/${locale}/ui.json`;
  const mod = uiLocaleModules[key];
  return mod ? (mod.default as UILocaleResources) : null;
};

const loadLobeUIBuiltinResources = (locale: string): UILocaleResources | null => {
  if (locale.startsWith('zh')) return zhCn as UILocaleResources;
  return en as UILocaleResources;
};

export const getUILocaleAndResources = async (
  locale: string | 'auto',
): Promise<{ locale: string; resources: UILocaleResources }> => {
  const effectiveLocale = locale === 'auto' ? 'en-US' : locale;
  const normalizedLocale = normalizeLocale(effectiveLocale);
  const uiLocale = getUILocale(normalizedLocale);

  const resources =
    loadBusinessResources(normalizedLocale) ??
    loadLobeUIBuiltinResources(normalizedLocale) ??
    loadBusinessResources('en-US') ??
    loadLobeUIBuiltinResources('en-US');

  if (!resources)
    throw new Error(`Failed to load UI resources for locale=${normalizedLocale}`);

  return { locale: uiLocale, resources };
};
```

> **注意**：`loadBusinessResources` 和 `loadLobeUIBuiltinResources` 从 async 变为同步函数（eager 模块无需 await）。`@lobehub/ui` 的 built-in resources 也改为顶层静态 import（等价于原 modifier 的 `import { en, zhCn } from '...'`）。

#### 3.2d `src/layout/SPAGlobalProvider/Locale.desktop.tsx`

与 `Locale.tsx` 相同，但 dayjs locale 使用 `{ eager: true }`：

```typescript
// eager: true — dayjs locale 全量内联
const dayjsLocaleModules = import.meta.glob<{ default: ILocale }>(
  '/node_modules/dayjs/locale/*.js',
  { eager: true },
);

const updateDayjs = (lang: string) => {
  const locale = lang.toLowerCase() === 'en-us' ? 'en' : lang.toLowerCase();
  const key = `/node_modules/dayjs/locale/${locale}.js`;
  const mod = dayjsLocaleModules[key] ?? dayjsLocaleModules['/node_modules/dayjs/locale/en.js'];

  if (mod) dayjs.locale((mod as any).default);
};
```

> `updateDayjs` 从 async 变为同步函数。

### 3.3 等价性总结

| 原 Modifier | 等价方案 | 机制 |
|---|---|---|
| nextConfig | 不需要 | 不再使用 Next.js 构建 |
| nextDynamicToStatic | `.vite.ts` 已处理 | SPA 无 `next/dynamic` |
| dynamicToStatic | Vite 原生 | `React.lazy` code splitting |
| **i18nDynamicToStatic** | **4 个 `.desktop.ts` 文件** | `import.meta.glob({ eager: true })` 同步预加载 |
| settingsContentToStatic | Vite 原生 | `React.lazy` code splitting |
| wrapChildrenWithClientOnly | 不需要 | SPA 纯客户端 |
| removeSuspense | 不需要 | Suspense 正常工作 |
| staticExport | 不需要 | 无 Next.js 路由 |
| appCode | 已处理 / 按需 `.desktop` | 见类别 D |
| routes | 不需要 | `desktopRoutes` 仅含桌面路由 |
| cleanUp | `.vite.ts` 已处理 | 绕过 server-only 模块 |

---

## Phase 4: Electron 主进程适配

**目标**：更新 Electron 主进程，加载 Vite Renderer 产物。

### 4.1 更新 `apps/desktop/src/main/const/dir.ts`

```typescript
// Before:
const nextExportOutDir = join(appPath, 'dist', 'next', 'out');
const nextExportDefaultDir = join(appPath, 'dist', 'next');
export const nextExportDir = pathExistsSync(nextExportOutDir)
  ? nextExportOutDir
  : nextExportDefaultDir;

// After:
export const rendererDir = join(appPath, 'dist', 'renderer');
```

### 4.2 更新 `RendererUrlManager.ts`

```typescript
// Before:
import { nextExportDir } from '@/const/dir';
// ...
constructor() {
  this.rendererProtocolManager = new RendererProtocolManager({
    nextExportDir,
    // ...
  });
}

// After:
import { rendererDir } from '@/const/dir';
// ...
constructor() {
  this.rendererProtocolManager = new RendererProtocolManager({
    rendererDir,
    // ...
  });
}
```

简化 `resolveRendererFilePath`：Vite SPA 只有一个 `index.html`，无需复杂的多页面解析。所有非静态资源请求都 fallback 到 `index.html`：

```typescript
resolveRendererFilePath = async (url: URL): Promise<string | null> => {
  const pathname = url.pathname;

  // 静态资源直接映射
  if (pathname.startsWith('/assets/') || extname(pathname)) {
    const filePath = join(rendererDir, pathname);
    return pathExistsSync(filePath) ? filePath : null;
  }

  // 所有路由 fallback 到 index.html（SPA）
  return join(rendererDir, 'index.html');
};
```

### 4.3 更新 `RendererProtocolManager.ts`

```typescript
// Before:
const RENDERER_DIR = 'next';

// After:
const RENDERER_DIR = 'renderer';
```

属性名 `nextExportDir` → `rendererDir` 全局重命名。

### 4.4 `_next/` 路径适配

原 Next.js 静态导出的资源路径前缀为 `/_next/static/`。Vite 产物的资源路径为 `/assets/`。`RendererUrlManager.resolveRendererFilePath` 和 `RendererProtocolManager.isAssetRequest` 中对 `/_next/` 的检查需更新：

```typescript
// Before:
if (pathname.startsWith('/_next/') || pathname.startsWith('/static/') || ...)

// After:
if (pathname.startsWith('/assets/') || ...)
```

### 4.5 `window.__SERVER_CONFIG__`

`__SERVER_CONFIG__` 无需运行时注入。Web SPA 的 catch-all route 也是 `force-static`，该值在构建时即可确定。Electron Renderer 的 `index.html` 中直接内联即可（见 Phase 2.1 中 `window.__SERVER_CONFIG__ = undefined`），或在 `SPAGlobalProvider` 中处理 `undefined` 的情况。

---

## Phase 5: `electron-builder.mjs` 更新

**目标**：更新打包配置，引用 Vite Renderer 产物。

```javascript
// Before:
files: [
  'dist',
  'dist/next/**/*',
  '!dist/next/docs',
  '!dist/next/packages',
  '!dist/next/.next/server/app/sitemap',
  '!dist/next/.next/static/media',
  // ...
]

// After:
files: [
  'dist',
  'dist/renderer/**/*',
  // 移除所有 dist/next 相关排除规则（Vite 产物无此结构）
  // ...
]
```

---

## Phase 6: 清理

**目标**：移除所有不再需要的文件和依赖。

### 6.1 删除文件

```
scripts/electronWorkflow/modifiers/          # 整个目录（13 个文件）
scripts/electronWorkflow/buildNextApp.mts    # shadow workspace 构建（已由 electron-vite 取代）
scripts/electronWorkflow/moveNextExports.ts  # 复制脚本（electron-vite 直接输出到 dist/renderer/）
```

### 6.2 删除/减少依赖

- `@ast-grep/napi` — 若仅 modifier 使用，从 devDependencies 移除
- `fs-extra`（根目录） — 检查是否仍有其他引用

### 6.3 更新 `package.json` scripts

移除：
- `desktop:build:renderer`
- `desktop:build:renderer:all`
- `desktop:build:renderer:prepare`

简化 `desktop:build:all` 和 `desktop:package:app`。

---

## Phase 7: 删除 `NEXT_PUBLIC_IS_DESKTOP_APP`，统一 `isDesktop`

**目标**：将分散在多个包和脚本中的 `isDesktop` 判断统一收归 `@lobechat/const`，并完全删除 `NEXT_PUBLIC_IS_DESKTOP_APP` 环境变量。

### 7.0 架构分析

在新的构建体系下，`NEXT_PUBLIC_IS_DESKTOP_APP` 可以完全删除：

| 运行环境 | `isDesktop` 值 | 理由 |
|---|---|---|
| **Vite Desktop SPA**（Electron Renderer） | `true` | `electron-vite` 构建时 `define: { '__ELECTRON__': 'true' }` |
| **Vite Web SPA** | `false` | `define: { '__ELECTRON__': 'false' }` |
| **Next.js 客户端**（仅 `(auth)` 路由组） | `false` | `(auth)` 路由组在 desktop 本地构建中不存在 |
| **Next.js 服务端** | `false` | Desktop 本地构建不含任何 Server 代码 |
| **脚本**（prebuild, registerDesktopEnv 等） | N/A | 脚本使用 `DESKTOP_BUILD` 环境变量判断 |

### 7.1 统一 `@lobechat/const` 中的 `isDesktop`

```typescript
// packages/const/src/version.ts — Before:
export const isDesktop =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_IS_DESKTOP_APP === '1'
    : process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';

// After:
export const isDesktop =
  typeof __ELECTRON__ !== 'undefined' && !!__ELECTRON__;
```

> **说明**：`__ELECTRON__` 由 Vite `define` 在构建时注入。所有 Vite config 均须声明此常量（electron-vite renderer 为 `true`，根目录 Web SPA 为 `false`），避免运行时 `ReferenceError`。无需环境变量。

需同步添加全局类型声明：

```typescript
// src/types/global.d.ts 或 packages/const/src/global.d.ts
declare const __ELECTRON__: boolean | undefined;
declare const __MOBILE__: boolean | undefined;
```

### 7.2 三个 builtin-tool 包统一 re-export

这三个包各自独立定义了 `isDesktop`，应改为从 `@lobechat/const` re-export：

```typescript
// packages/builtin-tool-skills/src/const.ts — Before:
export const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';

// After:
export { isDesktop } from '@lobechat/const';
```

```typescript
// packages/builtin-tool-gtd/src/const.ts — Before:
export const isDesktop =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_IS_DESKTOP_APP === '1'
    : process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';

// After:
export { isDesktop } from '@lobechat/const';
```

```typescript
// packages/builtin-tool-group-management/src/const.ts — Before:
// （同 builtin-tool-gtd）

// After:
export { isDesktop } from '@lobechat/const';
```

### 7.3 脚本改用 `DESKTOP_BUILD`

4 个脚本文件中的 `isDesktop` 判断从 `NEXT_PUBLIC_IS_DESKTOP_APP` 改为 `DESKTOP_BUILD`：

```typescript
// scripts/prebuild.mts — Before:
const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';
// After:
const isDesktop = process.env.DESKTOP_BUILD === 'true';

// scripts/runNextDesktop.mts — Before:
const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';
// After:
const isDesktop = process.env.DESKTOP_BUILD === 'true';

// scripts/registerDesktopEnv.cjs — Before:
const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';
// After:
const isDesktop = process.env.DESKTOP_BUILD === 'true';

// scripts/migrateServerDB/index.ts — Before:
const isDesktop = process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';
// After:
const isDesktop = process.env.DESKTOP_BUILD === 'true';
```

### 7.4 删除环境变量文件中的旧变量

```bash
# .env.desktop — Before:
NEXT_PUBLIC_IS_DESKTOP_APP=1

# After:
# 删除此行。DESKTOP_BUILD 无需在 .env 中定义，
# apps/desktop 下的构建天然即为 desktop build，
# 由 electron-vite config 的 define 直接注入 __ELECTRON__=true。
```

### 7.5 更新 `package.json` scripts

```jsonc
// Before:
"desktop:build:renderer": "cross-env ... NEXT_PUBLIC_IS_DESKTOP_APP=1 tsx scripts/electronWorkflow/buildNextApp.mts",
"dev:desktop": "cross-env NEXT_PUBLIC_IS_DESKTOP_APP=1 tsx scripts/runNextDesktop.mts dev -p 3015",

// After:
// desktop:build:renderer 已在 Phase 2 中删除
"dev:desktop": "cross-env DESKTOP_BUILD=true tsx scripts/runNextDesktop.mts dev -p 3015",
```

### 7.6 更新 `vite.config.ts`

```typescript
// Before:
define: {
  '__MOBILE__': JSON.stringify(isMobile),
  'process.env.NEXT_PUBLIC_IS_DESKTOP_APP': JSON.stringify(isElectron ? '1' : '0'),
},

// After:
define: {
  '__MOBILE__': JSON.stringify(isMobile),
  '__ELECTRON__': JSON.stringify(isElectron),
},
```

### 7.7 全局搜索清理

完成以上改动后，全局搜索以确保无遗漏：

```bash
# 应返回零结果
rg 'NEXT_PUBLIC_IS_DESKTOP_APP' --type-not md
rg 'VITE_IS_DESKTOP_APP' --type-not md
```

### 7.8 变更总结

| 文件 | 操作 |
|---|---|
| `packages/const/src/version.ts` | **修改** — `isDesktop` 改用 `__ELECTRON__` |
| `packages/builtin-tool-skills/src/const.ts` | **修改** — re-export from `@lobechat/const` |
| `packages/builtin-tool-gtd/src/const.ts` | **修改** — re-export from `@lobechat/const` |
| `packages/builtin-tool-group-management/src/const.ts` | **修改** — re-export from `@lobechat/const` |
| `src/types/global.d.ts` | **修改** — 添加 `__ELECTRON__` 类型声明 |
| `scripts/prebuild.mts` | **修改** — `DESKTOP_BUILD` |
| `scripts/runNextDesktop.mts` | **修改** — `DESKTOP_BUILD` |
| `scripts/registerDesktopEnv.cjs` | **修改** — `DESKTOP_BUILD` |
| `scripts/migrateServerDB/index.ts` | **修改** — `DESKTOP_BUILD` |
| `.env.desktop` | **修改** — 替换环境变量 |
| `package.json`（根） | **修改** — 更新 scripts |
| `vite.config.ts` | **修改** — `define` 改用 `__ELECTRON__` |

**净效果**：完全删除 `NEXT_PUBLIC_IS_DESKTOP_APP` 和 `VITE_IS_DESKTOP_APP` 两个环境变量，统一为编译时常量 `__ELECTRON__`。消除 4 处重复的 `isDesktop` 定义，收归 `@lobechat/const` 单一来源。

---

## Phase 8: 验证

### 8.1 构建验证

```bash
# 完整 Electron 构建（main + preload + renderer）
cd apps/desktop && npm run build:main
# 确认 dist/renderer/ 输出正确（index.html + assets/）

# 完整打包
npm run desktop:package:local
```

### 8.2 功能验证

- Electron 应用启动，加载 Vite SPA Renderer
- `app://renderer` protocol 正确响应
- 路由跳转正常（chat, settings, discover 等）
- 静态资源（JS/CSS/图片）正确加载
- i18n 切换正常
- Analytics（desktop Umami）正常
- Deep link（`lobehub://` protocol）正常

### 8.3 对比

| 指标 | Before（Next.js export） | After（electron-vite renderer） |
|---|---|---|
| 构建命令 | `buildNextApp.mts` + `moveNextExports.ts` + `electron-vite build`（分步） | `electron-vite build`（一步） |
| 构建时间 | ~60-120s（shadow workspace + modifiers + next build + copy） | ~20-30s（electron-vite 统一构建） |
| 构建复杂度 | 11 个 AST modifier + shadow workspace + 文件复制 | 零 modifier，标准 Vite 构建 |
| 维护成本 | 源码结构变化需同步更新 modifier | `.desktop` 后缀文件，与源码同步维护 |
| 产物结构 | `dist/next/` 多页面 HTML + `_next/` 资源 | `dist/renderer/` 单 `index.html` + `assets/` |

---

## 变更总结

| 文件 | 操作 | Phase |
|---|---|---|
| `scripts/electronWorkflow/modifiers/` | **删除整个目录**（13 个文件） | 1 |
| `scripts/electronWorkflow/buildNextApp.mts` | **删除** | 2 |
| `scripts/electronWorkflow/moveNextExports.ts` | **删除** | 2 |
| `apps/desktop/index.html` | **新增** — Renderer HTML 入口 | 2 |
| `apps/desktop/electron.vite.config.ts` | **修改** — 增加 `renderer` entry | 2 |
| `src/utils/i18n/loadI18nNamespaceModule.desktop.ts` | **新增** — eager glob 同步 i18n | 3 |
| `src/utils/locale.desktop.ts` | **新增** — eager glob 同步 antd locale | 3 |
| `src/libs/getUILocaleAndResources.desktop.ts` | **新增** — eager glob 同步 UI locale | 3 |
| `src/layout/SPAGlobalProvider/Locale.desktop.tsx` | **新增** — eager glob 同步 dayjs locale | 3 |
| `apps/desktop/src/main/const/dir.ts` | **修改** — `nextExportDir` → `rendererDir` | 4 |
| `apps/desktop/src/main/core/infrastructure/RendererUrlManager.ts` | **修改** — SPA fallback 逻辑 | 4 |
| `apps/desktop/src/main/core/infrastructure/RendererProtocolManager.ts` | **修改** — `RENDERER_DIR = 'renderer'` | 4 |
| `apps/desktop/electron-builder.mjs` | **修改** — `dist/next` → `dist/renderer` | 5 |
| `package.json`（根） | **修改** — 移除 `desktop:build:renderer*`，更新 scripts | 6, 7 |
| `packages/const/src/version.ts` | **修改** — `isDesktop` 改用 `__ELECTRON__` | 7 |
| `packages/builtin-tool-skills/src/const.ts` | **修改** — re-export from `@lobechat/const` | 7 |
| `packages/builtin-tool-gtd/src/const.ts` | **修改** — re-export from `@lobechat/const` | 7 |
| `packages/builtin-tool-group-management/src/const.ts` | **修改** — re-export from `@lobechat/const` | 7 |
| `src/types/global.d.ts` | **修改** — `__ELECTRON__` 类型声明 | 7 |
| `vite.config.ts` | **修改** — `define` 改用 `__ELECTRON__` | 7 |
| `scripts/prebuild.mts` | **修改** — `DESKTOP_BUILD` | 7 |
| `scripts/runNextDesktop.mts` | **修改** — `DESKTOP_BUILD` | 7 |
| `scripts/registerDesktopEnv.cjs` | **修改** — `DESKTOP_BUILD` | 7 |
| `scripts/migrateServerDB/index.ts` | **修改** — `DESKTOP_BUILD` | 7 |
| `.env.desktop` | **修改** — 替换环境变量 | 7 |

**净减少**：~2500 行 modifier 代码 + shadow workspace 构建逻辑 + 中间复制脚本 + 2 个环境变量（`NEXT_PUBLIC_IS_DESKTOP_APP`、`VITE_IS_DESKTOP_APP`） + 4 处重复 `isDesktop` 定义。
**构建流程**：从 4 步（`buildNextApp` → `moveNextExports` → `electron-vite build` → `electron-builder`）简化为 2 步（`electron-vite build` → `electron-builder`）。
**isDesktop 判断**：从 5 处分散定义（`@lobechat/const` + 3 个 builtin-tool + 4 个脚本）统一为 `@lobechat/const` 单一来源 + 编译时常量 `__ELECTRON__`。
