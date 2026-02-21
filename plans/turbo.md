# SPA ServerConfig 精简 + Turborepo Dev 集成

IMPORTANT: Not lint/format any code or do typecheck. and do git commit when you finish each task.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 精简 SPAServerConfig（移除 `locale`、`theme`）；catch-all 加 `[locale]` 段实现 `force-static` + 按语系生成 SEO meta；locale 由 index.html 前置 script 检测；turborepo dev 流程可用。

**Architecture:** middleware locale 检测逻辑保持不变（`?hl=` → cookie → `Accept-Language`）。SPA catch-all 路由从 `(spa)/[[...path]]/route.ts` 迁移至 `(spa)/[locale]/[[...path]]/route.ts`，标记 `force-static`，通过 `generateStaticParams` 为 18 种语系预渲染。每个语系 HTML 内嵌 locale 对应的 SEO meta（title/description/OG）。客户端 locale 由 `index.html` 前置 script 处理（读 cookie / `?hl=` / `navigator.language`），SPAGlobalProvider 从 DOM 读取。theme 字段直接删除（app 层已处理）。

**Tech Stack:** Next.js route handler, Vite, TypeScript, Turborepo

---

## Task 1: 验证 Turborepo Dev 可用

**Files:**
- 已有: `turbo.json`
- 已有: `package.json` scripts (`dev`, `dev:next`, `dev:spa`)

**Step 1: 运行 turbo dev 验证并行启动**

Run: `bun run dev`
Expected: Turborepo 并行启动 `dev:next`（port 3010）和 `dev:spa`（port 3011），两个进程均正常运行。

**Step 2: 验证代理连通**

访问 `http://localhost:3011`，确认 Vite SPA 页面正常渲染，API 请求代理至 Next.js（3010）。

---

## Task 2: index.html 注入 locale 检测前置 script

**Files:**
- Modify: `index.html`

**Step 1: 在 index.html 中添加 locale 检测 script**

在 `<div id="root"></div>` 之前插入前置 script，复用 proxy `define-config.ts` 中的 locale 检测优先级：

1. `?hl=` search param（最高优先级，同时持久化至 cookie）
2. `LOBE_LOCALE` cookie
3. `navigator.language`（等同服务端 `Accept-Language`）
4. fallback `en-US`

若值为 `auto` 则降级至 `navigator.language`。

完整 `index.html`：

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!--SEO_META-->
  </head>
  <body>
    <script>
      (function () {
        var hl = new URLSearchParams(location.search).get('hl');
        var m = document.cookie.match(/(?:^|;\s*)LOBE_LOCALE=([^;]*)/);
        var cookie = m ? decodeURIComponent(m[1]) : '';
        var locale = hl || cookie || navigator.language || 'en-US';
        if (locale === 'auto') locale = navigator.language || 'en-US';
        if (hl && !cookie) {
          document.cookie = 'LOBE_LOCALE=' + encodeURIComponent(hl) + ';path=/;max-age=7776000;SameSite=Lax';
        }
        document.documentElement.lang = locale;
        var rtl = ['ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'ur', 'yi'];
        document.documentElement.dir = rtl.indexOf(locale.split('-')[0].toLowerCase()) >= 0 ? 'rtl' : 'ltr';
      })();
    </script>
    <div id="root"></div>
    <script>
      window.__SERVER_CONFIG__ = undefined; /* SERVER_CONFIG */
    </script>
    <!--ANALYTICS_SCRIPTS-->
    <script type="module" src="/src/entry.desktop.tsx"></script>
  </body>
</html>
```

> 注：此 script 完全复用 proxy `define-config.ts` 的 locale 检测逻辑（`?hl=` → cookie → browser language），包括 `?hl=` 持久化至 cookie（90 天 = 7776000 秒）。middleware 中的 locale 逻辑保持不变。`<!--LOCALE-->` / `<!--DIR-->` 占位符移除；`<!--SEO_META-->` 保留，由 Task 5 的 `force-static` route 注入各语系 SEO meta。

**Step 2: 验证 dev 模式**

Run: `bun run dev:spa`
打开浏览器，检查 `document.documentElement.lang` 是否正确从 cookie 或 `navigator.language` 取值。

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add locale detection script to index.html for SPA dev mode"
```

---

## Task 3: SPAServerConfig 类型重构 — 移除 theme 和 locale

**Files:**
- Modify: `src/types/spaServerConfig.ts`

**Step 1: 直接删除 locale 和 theme，不做合并**

```typescript
// src/types/spaServerConfig.ts
import type { IFeatureFlags } from '@/config/featureFlags';
import type { GlobalServerConfig } from '@/types/serverConfig';

export interface AnalyticsConfig {
  clarity?: { projectId: string };
  desktop?: { baseUrl: string; projectId: string };
  google?: { measurementId: string };
  plausible?: { domain: string; scriptBaseUrl: string };
  posthog?: { debug: boolean; host: string; key: string };
  reactScan?: { apiKey: string };
  umami?: { scriptUrl: string; websiteId: string };
  vercel?: { debug: boolean; enabled: boolean };
}

export interface SPAClientEnv {
  marketBaseUrl?: string;
  pyodideIndexUrl?: string;
  pyodidePipIndexUrl?: string;
  s3FilePath?: string;
}

export interface SPAServerConfig {
  analyticsConfig: AnalyticsConfig;
  clientEnv: SPAClientEnv;
  config: GlobalServerConfig;
  featureFlags: Partial<IFeatureFlags>;
  isMobile: boolean;
}
```

变更:
- 删除 `SPAThemeConfig` interface
- 删除 `locale: string` 和 `theme: SPAThemeConfig`
- `SPAClientEnv` 不变（不合并 theme 字段）

**Step 2: 验证类型**

Run: `bunx tsc --noEmit --pretty src/types/spaServerConfig.ts` （预期此文件本身无错，后续文件会报错待 Task 4/5 修复）

**Step 3: Commit**

```bash
git add src/types/spaServerConfig.ts
git commit -m "refactor: remove locale and theme from SPAServerConfig"
```

---

## Task 4: Middleware 不改 — 仅确认 SPA 路由透传兼容

**Files:**
- 确认: `src/libs/next/proxy/define-config.ts`（不修改）

**背景:** middleware locale 检测逻辑（`?hl=` → cookie → `Accept-Language`、`RouteVariants.serializeVariants`、cookie 持久化）保持不变。SPA 路由当前走 `NextResponse.next()` 透传至 catch-all，无需改动 — `[locale]` 段将在 Task 5 中通过 `generateStaticParams` 静态生成，不需要 middleware rewrite。

**Step 1: 确认 SPA pass-through 逻辑**

在 `define-config.ts:102` 处：
```typescript
if (!isNextjsRoute) {
  logDefault('SPA route, passing through to catch-all: %s', url.pathname);
  // ...
  return response;
}
```

SPA 路由不做 rewrite，直接透传。Next.js 的 `[locale]/[[...path]]` catch-all 会匹配 `/en-US/chat` 这类路径（如果用户直接访问的话），但实际上 SPA 路由不携带 locale prefix（主要走 `generateStaticParams` 生成的默认 locale 页面）。

> 此 Task 无代码变更，仅确认 middleware 兼容新架构。

---

## Task 5: Catch-all 迁移至 `[locale]` 段 + force-static + SEO meta

**Files:**
- Move: `src/app/(spa)/[[...path]]/route.ts` → `src/app/(spa)/[locale]/[[...path]]/route.ts`
- Move: `src/app/(spa)/[[...path]]/spaHtmlTemplates.ts` → `src/app/(spa)/[locale]/[[...path]]/spaHtmlTemplates.ts`

**背景:** 将 catch-all GET 改为 `force-static`，通过 `generateStaticParams` 为全部 18 种语系预渲染。每个语系页面的 `<!--SEO_META-->` 占位符替换为对应 locale 的 title、description、OG meta。运行时不再动态检测 locale 和 theme。

**Step 1: 移动文件至 `[locale]` 目录**

```bash
mkdir -p 'src/app/(spa)/[locale]/[[...path]]'
mv 'src/app/(spa)/[[...path]]/route.ts' 'src/app/(spa)/[locale]/[[...path]]/route.ts'
mv 'src/app/(spa)/[[...path]]/spaHtmlTemplates.ts' 'src/app/(spa)/[locale]/[[...path]]/spaHtmlTemplates.ts'
rmdir 'src/app/(spa)/[[...path]]'
```

**Step 2: 重写 route.ts**

完整新 `route.ts`：

```typescript
import { BRANDING_NAME, ORG_NAME } from '@lobechat/business-const';
import { OG_URL } from '@lobechat/const';

import { getServerFeatureFlagsValue } from '@/config/featureFlags';
import { OFFICIAL_URL } from '@/const/url';
import { isCustomBranding, isCustomORG } from '@/const/version';
import { analyticsEnv } from '@/envs/analytics';
import { appEnv } from '@/envs/app';
import { fileEnv } from '@/envs/file';
import { pythonEnv } from '@/envs/python';
import { locales } from '@/locales/resources';
import { getServerGlobalConfig } from '@/server/globalConfig';
import { translation } from '@/server/translation';
import { serializeForHtml } from '@/server/utils/serializeForHtml';
import {
  type AnalyticsConfig,
  type SPAClientEnv,
  type SPAServerConfig,
} from '@/types/spaServerConfig';

import { desktopHtmlTemplate, mobileHtmlTemplate } from './spaHtmlTemplates';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const isDev = process.env.NODE_ENV === 'development';
const VITE_DEV_ORIGIN = process.env.VITE_DEV_ORIGIN || 'http://localhost:3011';

// --- rewriteViteAssetUrls 保持不变 ---

async function getTemplate(isMobile: boolean): Promise<string> {
  if (isDev) {
    const res = await fetch(VITE_DEV_ORIGIN);
    const html = await res.text();
    return await rewriteViteAssetUrls(html);
  }
  return isMobile ? mobileHtmlTemplate : desktopHtmlTemplate;
}

function buildAnalyticsConfig(): AnalyticsConfig {
  // ... 保持不变 ...
}

function buildClientEnv(): SPAClientEnv {
  // ... 保持不变 ...
}

async function buildSeoMeta(locale: string): Promise<string> {
  const { t } = await translation('metadata', locale);
  const title = t('chat.title', { appName: BRANDING_NAME });
  const description = t('chat.description', { appName: BRANDING_NAME });

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${OFFICIAL_URL}" />`,
    `<meta property="og:image" content="${OG_URL}" />`,
    `<meta property="og:site_name" content="${BRANDING_NAME}" />`,
    `<meta property="og:locale" content="${locale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${OG_URL}" />`,
    `<meta name="twitter:site" content="${isCustomORG ? `@${ORG_NAME}` : '@lobehub'}" />`,
  ].join('\n    ');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; path?: string[] }> },
) {
  const { locale } = await params;

  // force-static: no request headers available, default to desktop
  const isMobile = false;

  const serverConfig = await getServerGlobalConfig();
  const featureFlags = getServerFeatureFlagsValue();
  const analyticsConfig = buildAnalyticsConfig();
  const clientEnv = buildClientEnv();

  const spaConfig: SPAServerConfig = {
    analyticsConfig,
    clientEnv,
    config: serverConfig,
    featureFlags,
    isMobile,
  };

  let html = await getTemplate(isMobile);

  html = html.replace(
    /window\.__SERVER_CONFIG__\s*=\s*undefined;\s*\/\*\s*SERVER_CONFIG\s*\*\//,
    `window.__SERVER_CONFIG__ = ${serializeForHtml(spaConfig)};`,
  );

  const seoMeta = await buildSeoMeta(locale);
  html = html.replace('<!--SEO_META-->', seoMeta);
  html = html.replace('<!--ANALYTICS_SCRIPTS-->', '');

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
```

变更要点：
- 删除: `buildThemeConfig`、`SPAThemeConfig` import、`isRtlLang`、`parseBrowserLanguage`、`DEFAULT_LANG`、`LOBE_LOCALE_COOKIE`、`NextRequest`
- 删除: `cookieLocale`、`browserLanguage`、`locale` 检测、`dir`、`theme`
- 删除: `<!--LOCALE-->`、`<!--DIR-->` 替换
- 删除: `Vary` / `cache-control` header（`force-static` 由 Next.js 管理缓存）
- 新增: `export const dynamic = 'force-static'`
- 新增: `export function generateStaticParams()` — 返回 18 种 locale
- 新增: `buildSeoMeta(locale)` — 复用 `translation('metadata', locale)` 生成 SEO meta HTML
- 新增: `locale` 从 route params 获取（`{ params: Promise<{ locale: string; path?: string[] }> }`）
- `isMobile` 硬编码 `false`（force-static 无 request headers，客户端由前置 script + React 处理）
- `spaConfig` 不再包含 `locale` 和 `theme`
- `GET` 函数签名从 `NextRequest` 改为 `Request`（force-static 限制）

**Step 3: Commit**

```bash
git add 'src/app/(spa)/[locale]/[[...path]]/' 'src/app/(spa)/[[...path]]/'
git commit -m "feat: add [locale] segment with force-static and SEO meta generation"
```

---

## Task 6: 更新 SPAGlobalProvider — 移除 theme/locale 读取

**Files:**
- Modify: `src/layout/SPAGlobalProvider/index.tsx`

**Step 1: 修改 SPAGlobalProvider**

1. `locale`：`serverConfig` 已无 `locale` 字段，将 `serverConfig?.locale ?? document.documentElement.lang ?? 'en-US'` 简化为 `document.documentElement.lang || 'en-US'`
2. `theme`：`serverConfig` 已无 `theme` 字段，删除 `customFontFamily`/`customFontURL`/`globalCDN` 三个 prop 传递，`<AppTheme>` 不传 prop（均 optional）

```typescript
const SPAGlobalProvider = memo<PropsWithChildren>(({ children }) => {
  const serverConfig: SPAServerConfig | undefined = window.__SERVER_CONFIG__;

  const locale = document.documentElement.lang || 'en-US';
  const isMobile = serverConfig?.isMobile ?? typeof __MOBILE__ !== 'undefined' ? __MOBILE__ : false;

  return (
    <StyleRegistry>
      <Locale defaultLang={locale}>
        <NextThemeProvider>
          <AppTheme>
            {/* ... 其余不变 ... */}
          </AppTheme>
        </NextThemeProvider>
      </Locale>
    </StyleRegistry>
  );
});
```

**Step 2: Commit**

```bash
git add src/layout/SPAGlobalProvider/index.tsx
git commit -m "refactor: remove theme/locale reads from SPAGlobalProvider"
```

---

## Task 7: 更新 global.d.ts 类型声明

**Files:**
- Modify: `src/types/global.d.ts`

**Step 1: 确认 Window.__SERVER_CONFIG__ 类型仍正确**

`global.d.ts` 已声明 `Window.__SERVER_CONFIG__` 为 `import('./spaServerConfig').SPAServerConfig | undefined`，由于 Task 3 已修改 `SPAServerConfig` 类型，此处无需改动。仅需确认类型推导正确。

**Step 2: 验证**

Run: `bunx tsc --noEmit --pretty src/types/global.d.ts`
Expected: PASS

---

## Task 8: vite.config.ts — base 区分 dev/prod

**Files:**
- Modify: `vite.config.ts`

**背景:** Vite 构建产物放入 `public/spa/`，由 Next.js 静态托管。prod 模式下 JS/CSS 资源路径需以 `/spa/` 为前缀。dev 模式下 Vite dev server 直接服务，base 为 `/`。

**Step 1: 添加 base 配置**

```typescript
const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
  base: isDev ? '/' : '/spa/',
  // ... 其余不变
});
```

> 注：`mode` 参数也可用，但 `process.env.NODE_ENV` 更直接。`vite build` 默认 `NODE_ENV=production`，`vite`（dev server）默认 `NODE_ENV=development`。

**Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "feat: set vite base to /spa/ for production builds"
```

---

## Task 9: spaHtmlTemplates 改为构建时生成

**Files:**
- Create: `scripts/generateSpaTemplates.mts`
- Modify: `src/app/(spa)/[locale]/[[...path]]/spaHtmlTemplates.ts`（将由脚本自动覆写）
- Modify: `package.json`（更新 `build:spa` script）

**背景:** 当前 `spaHtmlTemplates.ts` 运行时用 `readFileSync` 读取 `public/spa/` 下 HTML 文件。改为 `vite build` 后由脚本读取产物 HTML，生成内联 string 常量的 `.ts` 文件，消除运行时文件读取依赖。

**Step 1: 创建生成脚本**

```typescript
// scripts/generateSpaTemplates.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const desktopHtml = readFileSync(resolve(root, 'dist/desktop/index.html'), 'utf-8');
const mobileHtml = readFileSync(resolve(root, 'dist/mobile/index.html'), 'utf-8');

const output = `// Auto-generated by scripts/generateSpaTemplates.mts after vite build
// Do not edit manually

export const desktopHtmlTemplate = ${JSON.stringify(desktopHtml)};

export const mobileHtmlTemplate = ${JSON.stringify(mobileHtml)};
`;

writeFileSync(
  resolve(root, 'src/app/(spa)/[locale]/[[...path]]/spaHtmlTemplates.ts'),
  output,
  'utf-8',
);

console.log('Generated spaHtmlTemplates.ts');
```

**Step 2: 更新 package.json scripts**

核心变更：`build` = `build:spa` + `build:next`。

```jsonc
{
  "build": "bun run build:spa && bun run build:next",
  "build:next": "cross-env NODE_OPTIONS=--max-old-space-size=8192 next build --webpack",
  "build:spa": "vite build && cross-env MOBILE=true vite build && tsx scripts/generateSpaTemplates.mts",
  "build:spa:copy": "mkdir -p public/spa && cp -r dist/desktop/assets dist/mobile/assets public/spa/",
  "build:docker": "npm run prebuild && bun run build:spa && bun run build:spa:copy && NODE_OPTIONS=--max-old-space-size=8192 DOCKER=true next build --webpack && npm run build-sitemap"
}
```

变更说明：
- `build`：从单独 `next build` 改为 `build:spa` + `build:next`，先 Vite 构建 SPA + 生成模板，再 Next.js 构建
- `build:next`：拆出原 `build` 中的 `next build` 部分
- `build:spa`：末尾追加 `tsx scripts/generateSpaTemplates.mts`
- `build:spa:copy`：仅复制静态资源（JS/CSS assets），HTML 已内联至代码
- `build:docker`：不变（已直接调用 `build:spa` + `build:spa:copy` + `next build`）

**Step 3: 将 spaHtmlTemplates.ts 加入 .gitignore**

```
# Auto-generated SPA templates
src/app/(spa)/[locale]/[[...path]]/spaHtmlTemplates.ts
```

> 注：此文件由 CI/build 生成，不提交。dev 模式下 route.ts 的 `getTemplate` 走 `fetch(VITE_DEV_ORIGIN)` 分支，不依赖此文件（prod template 为空字符串不影响 dev）。

**Step 4: Commit**

```bash
git add scripts/generateSpaTemplates.mts package.json .gitignore
git commit -m "feat: auto-generate spaHtmlTemplates from vite build output"
```

---

## Task 10: 全量类型检查 + 清理

**Files:**
- Check: `catch-all.eg.ts`（若引用旧类型需更新或删除）

**Step 1: 全量类型检查**

Run: `bun run type-check`
Expected: PASS。若有报错，修复引用旧 `SPAThemeConfig` 或 `serverConfig.locale` / `serverConfig.theme` 的文件。

**Step 2: 检查 catch-all.eg.ts**

此文件为参考实现，若引用了 `SPAThemeConfig`，删除或更新。

**Step 3: 最终 Commit**

```bash
git add -A
git commit -m "refactor: cleanup after SPAServerConfig simplification"
```

---

## Task 11: `(spa)` 路由组重命名为 `spa` 真实路由段

**背景:** Next.js 报错 `You cannot use different slug names for the same dynamic path ('variants' !== 'locale')`。`(spa)` 路由组内 `[locale]` 与其他路由组内 `[variants]` 冲突。解决方案：将 `(spa)` 路由组改为 `spa` 真实路由段，middleware 做 rewrite。

**Files:**
- Move: `src/app/(spa)/` → `src/app/spa/`
- Modify: `src/libs/next/proxy/define-config.ts` — SPA 路由不再 pass-through，改为 `NextResponse.rewrite()` 至 `/spa/[locale]/...`

**变更:**
1. `src/app/spa/[locale]/[[...path]]/route.ts` — 路径从 `(spa)` 改为 `spa`
2. middleware — SPA 路由 rewrite: `url.pathname = /spa/${locale}${pathname}`；直接访问 `/spa/` 前缀的请求 pass-through
3. `.gitignore` / `scripts/generateSpaTemplates.mts` — 更新路径为 `src/app/spa/...`

---

## Task 12: Vite module redirect 插件

**背景:** `resolve.alias` 无法覆盖 `vite-tsconfig-paths` 先解析的 `@/` 路径。改用自定义 Vite 插件 `viteModuleRedirect()`，`enforce: 'pre'`，在 `resolveId` hook 中拦截已解析的绝对路径并重定向至 `.vite.ts` 版本。

**Files:**
- Modify: `vite.config.ts` — 新增 `viteModuleRedirect()` 插件
- Create: `src/libs/getUILocaleAndResources.vite.ts` — `import.meta.glob` 版本

**重定向映射:**
```
src/utils/locale.ts              → src/utils/locale.vite.ts
src/utils/i18n/loadI18nNamespaceModule.ts → src/utils/i18n/loadI18nNamespaceModule.vite.ts
src/libs/getUILocaleAndResources.ts       → src/libs/getUILocaleAndResources.vite.ts
```

---

## Task 13: SPAGlobalProvider 专用 Locale 组件

**背景:** `SPAGlobalProvider` 直接 import `@/layout/GlobalProvider/Locale`，其中 `dayjs/locale/${locale}.js` 动态 import 无法被 Vite 静态分析。需创建 SPA 专用 Locale 组件。

**Files:**
- Create: `src/layout/SPAGlobalProvider/Locale.tsx` — 用 `import.meta.glob('/node_modules/dayjs/locale/*.js')` 加载 dayjs locale，移除 `isOnServerSide` SSR 逻辑
- Modify: `src/layout/SPAGlobalProvider/index.tsx` — import 改为 `./Locale`

**与 GlobalProvider/Locale.tsx 的差异:**
- dayjs locale: `import(`dayjs/locale/${locale}.js`)` → `import.meta.glob` 静态映射
- 移除 `isOnServerSide` 分支（SPA 永远在客户端）
- `getAntdLocale` 由 viteModuleRedirect 插件自动重定向至 `.vite.ts` 版本

---

## Task 14: 移除 SPA 中 server-only 依赖

**背景:** SPA 入口树中存在多个 server-only 模块引用，导致 Vite 浏览器环境报错。

### 14a: DevPanel — `node:fs`

`SPAGlobalProvider` 导入 `DevPanel`，其 `getCacheEntries.ts` 使用 `node:fs`。

**修复:** 注释 DevPanel import 及 JSX 引用（SPA 不需要 Next.js cache viewer）。

**Files:**
- Modify: `src/layout/SPAGlobalProvider/index.tsx` — 注释 `import DevPanel` 和 `<DevPanel />`

### 14b: HighlightNotification — `next/link` → `<a>`

`Footer → HighlightNotification` 导入 `next/link`，Vite 加载 `next` 包连带触发 `sharp`（optionalDependency）。

**修复:** `next/link` 仅用于外链（`target="_blank"`），替换为 `<a>` 标签。

**Files:**
- Modify: `src/components/HighlightNotification/index.tsx` — `import Link from 'next/link'` → 删除，`<Link>` → `<a>`

### 14c: mdx/Image — `plaiceholder` → `sharp`

`ChangelogModal → ChangelogContent → CustomMDX → mdx/Image.tsx` 导入 `plaiceholder`（内嵌 sharp）。

**修复:** 创建 `Image.vite.tsx`，去掉 `plaiceholder`/`Buffer`/`'use server'`，直接渲染 `<Image>`。

**Files:**
- Create: `src/components/mdx/Image.vite.tsx`
- Modify: `vite.config.ts` — 加入 redirect

### 14d: AuthProvider — `@t3-oss/env-core` server env

`AuthProvider` 访问 `authEnv.AUTH_SECRET`（`@t3-oss/env-core` server 变量），浏览器端抛出 "Attempted to access a server-side environment variable on the client"。

**修复:** 创建 `index.vite.tsx`，跳过 `authEnv` 检查，直接用 `BetterAuth`（无 auth 时 `useSession()` 返回空 session，等效 `NoAuth`）。

**Files:**
- Create: `src/layout/AuthProvider/index.vite.tsx`
- Modify: `vite.config.ts` — 加入 redirect

### 14e: LobeAnalyticsProviderWrapper — `@t3-oss/env-core` server env

`LobeAnalyticsProviderWrapper` 访问 `analyticsEnv`（同为 server 变量）。

**修复:** 创建 `.vite.tsx` 版本，从 `window.__SERVER_CONFIG__.analyticsConfig` 读取。

**Files:**
- Create: `src/components/Analytics/LobeAnalyticsProviderWrapper.vite.tsx`
- Modify: `vite.config.ts` — 加入 redirect

### 14f: navigation.ts — 还原 `next/navigation` 再导出

`src/libs/next/navigation.ts` 被直接改为 react-router-dom 实现，导致 Next.js SSR（如 `(auth)` 路由组）中 `useLocation()` 无 Router context 报错。

**修复:** 还原 `navigation.ts` 为 `next/navigation` 再导出；创建 `navigation.vite.ts`（react-router-dom 实现），通过 redirect 切换。

**Files:**
- Modify: `src/libs/next/navigation.ts` — 还原为 `next/navigation` 再导出（不含 `useServerInsertedHTML`）
- Create: `src/libs/next/navigation.vite.ts` — react-router-dom 实现
- Modify: `vite.config.ts` — 加入 redirect

---

## 变更总结

| 文件 | 变更 |
|---|---|
| `index.html` | 添加 locale 检测前置 script（`?hl=` → cookie → browser），保留 `<!--SEO_META-->` 占位符 |
| `src/types/spaServerConfig.ts` | 删除 `SPAThemeConfig`、`locale`、`theme`；`SPAClientEnv` 不变 |
| `src/libs/next/proxy/define-config.ts` | SPA 路由 rewrite 至 `/spa/[locale]/...`；`/spa/` 前缀直接 pass-through |
| `src/app/spa/[locale]/[[...path]]/route.ts` | 从 `(spa)/[[...path]]/` 迁移至 `spa/[locale]/[[...path]]/`；`force-static` + `generateStaticParams`(18 locales) + `buildSeoMeta` |
| `src/app/spa/[locale]/[[...path]]/spaHtmlTemplates.ts` | 迁移至新路径；改为自动生成，加入 `.gitignore` |
| `src/layout/SPAGlobalProvider/index.tsx` | locale 从 DOM 读取；移除 theme prop；import Locale 改为 `./Locale`；注释 DevPanel |
| `src/layout/SPAGlobalProvider/Locale.tsx` | 新增：SPA 专用 Locale，`import.meta.glob` 加载 dayjs/antd locale，无 SSR 逻辑 |
| `src/components/HighlightNotification/index.tsx` | `next/link` → `<a>`（外链场景） |
| `src/components/mdx/Image.vite.tsx` | 新增：去掉 `plaiceholder`/`sharp`，直接渲染 `<Image>` |
| `src/layout/AuthProvider/index.vite.tsx` | 新增：跳过 `authEnv` server env，直接用 BetterAuth |
| `src/components/Analytics/LobeAnalyticsProviderWrapper.vite.tsx` | 新增：从 `window.__SERVER_CONFIG__` 读取 analytics 配置 |
| `src/libs/next/navigation.ts` | 还原为 `next/navigation` 再导出 |
| `src/libs/next/navigation.vite.ts` | 新增：react-router-dom 实现 |
| `vite.config.ts` | `base`: dev `/` → prod `/spa/`；`viteModuleRedirect()` 插件含 8 条重定向规则 |
| `src/utils/locale.vite.ts` | 已有：`import.meta.glob` 加载 antd locale |
| `src/utils/i18n/loadI18nNamespaceModule.vite.ts` | 已有：`import.meta.glob` 加载 i18n namespace |
| `src/libs/getUILocaleAndResources.vite.ts` | 新增：`import.meta.glob` 版本 |
| `scripts/generateSpaTemplates.mts` | 新增：vite build 后生成内联 HTML string 的 `.ts` |
| `package.json` | `build` = `build:spa` + `build:next`；`build:spa` 追加模板生成 |
| `turbo.json` | `dev` → `dev:next` 任务定义修复 |
