# Migration Plan: Next.js App Router → Vite + React Router SPA

## Context

LobeChat 前端已基本完成 React Router 迁移（231 文件），`src/libs/next/` 已预置抽象层。但 `next dev` 编译 20s+、内存 8-12G+，严重影响开发效率。本计划将前端构建从 Next App Router 迁至 Vite SPA，后端保留 Next.js。

### 核心架构决策

- **RouteVariants 机制**：删除
- **Locale/Mobile**：Vite 分两次 build 分别产出 desktop bundle 和 mobile bundle（通过 `define: { __MOBILE__: true/false }` 注入）。Locale 不由服务端注入，而是在 `index.html` 中插入前置 script 从 cookie（`LOBE_LOCALE`）读取并设置到 `document.documentElement.lang`。Next.js catch-all route 仅注入 serverConfig
- **静态资源**：Vite 产物放 `public/spa/`，HTML 由 Next.js route handler 读取模板并字符串替换后返回
- **环境变量**：大部分 `NEXT_PUBLIC_*` 移入 `window.__SERVER_CONFIG__` 运行时注入，仅 2-3 个保留为构建时 `VITE_*`
- **Auth 页面**：`(auth)` route group 保留 Next.js App Router 不动，页面组件内的 router hook 改用 `next/navigation`（而非 react-router-dom）；`oauth/consent/[uid]` 保留 Next.js page（catch-all 排除此路径）
- **Desktop Electron**：本次仅迁移 web 端，desktop 构建流程暂不动，后续单独 PR 适配

---

## Phase 1: 环境变量整治（前置，不改架构）

**目标**：统一散落的 `NEXT_PUBLIC_*` 引用，修复已知 bug，为后续迁移扫清障碍。

### 1.1 修复 Pyodide 变量名不一致 bug

- `src/envs/python.ts:8` schema 定义 `NEXT_PUBLIC_PYODIDE_PIP_INDEX_URL`
- `src/services/python.ts:13` 实际读取 `NEXT_PUBLIC_PYPI_INDEX_URL`
- **操作**：统一为 `NEXT_PUBLIC_PYODIDE_PIP_INDEX_URL`（与 schema 一致），`src/services/python.ts` 改为读取 `pythonEnv.NEXT_PUBLIC_PYODIDE_PIP_INDEX_URL`

### 1.2 收敛散落的直接 `process.env.NEXT_PUBLIC_*` 引用

将散落引用改为经 `src/envs/` 读取，便于后续统一替换：

| 文件 | 当前 | 改为 |
|---|---|---|
| `src/services/python.ts:12-13` | `process.env.NEXT_PUBLIC_PYODIDE_INDEX_URL` | `pythonEnv.NEXT_PUBLIC_PYODIDE_INDEX_URL` |
| `src/layout/AuthProvider/MarketAuth/MarketAuthProvider.tsx:169` | `process.env.NEXT_PUBLIC_MARKET_BASE_URL` | `appEnv.MARKET_BASE_URL`（新增到 appEnv） |
| `src/components/Analytics/Desktop.tsx:9-14` | `process.env.NEXT_PUBLIC_DESKTOP_*` | 新增 `desktopAnalyticsEnv`，或合入 `analyticsEnv` |
| `packages/const/src/version.ts:7` | `process.env.NEXT_PUBLIC_IS_DESKTOP_APP` | 保持（构建时常量，后续改 `VITE_*`） |
| `packages/builtin-tool-group-management/src/const.ts:1` | 同上 | 同上 |
| `packages/builtin-tool-gtd/src/const.ts:1` | 同上 | 同上 |

### 1.3 服务端 `NEXT_PUBLIC_MARKET_BASE_URL` 去前缀

5 个服务端文件直接读 `process.env.NEXT_PUBLIC_MARKET_BASE_URL`，改为 `MARKET_BASE_URL`：

- `src/server/services/market/index.ts:11`
- `src/server/routers/lambda/market/agent.ts:11`
- `src/server/routers/lambda/market/agentGroup.ts:11`
- `src/app/(backend)/market/oidc/[[...segments]]/route.ts:7`
- `src/server/services/discover/index.ts:97`

**验证**：`bun run type-check` 通过；现有功能不受影响。

---

## Phase 2: Vite 工程搭建

**目标**：建立 Vite SPA 工程入口，能在本地启动并看到基础页面壳。

### 2.1 工程结构（直接在 src 中修改，不创建 web-spa app）

在项目根目录新增 Vite 相关文件，复用现有 `src/`：

```
lobe-chat/
├── vite.config.ts          # Vite 配置（两次 build：desktop + mobile）
├── index.html              # SPA 入口 HTML 模板
├── src/
│   ├── entry.desktop.tsx   # Desktop SPA 入口
│   └── entry.mobile.tsx    # Mobile SPA 入口
└── ...（现有 src/ 结构不变）
```

### 2.2 Vite 配置要点（两次独立 build）

Desktop 和 Mobile 分别执行一次 `vite build`，通过 `define` 注入 `__MOBILE__` 常量，产出两个独立 bundle：

```ts
// vite.config.ts 关键配置
import { defineConfig } from 'vite';

const isMobile = process.env.MOBILE === 'true';

export default defineConfig({
  build: {
    outDir: isMobile ? 'dist/mobile' : 'dist/desktop',
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  define: {
    __MOBILE__: JSON.stringify(isMobile),
    'process.env.NEXT_PUBLIC_IS_DESKTOP_APP': JSON.stringify('0'),
  },
  plugins: [
    react({ jsxImportSource: '@emotion/react' }),  // emotion 支持
    // WASM 支持（Vite 原生）
  ],
});
```

构建命令：
```bash
# Desktop bundle
vite build

# Mobile bundle
MOBILE=true vite build
```

### 2.3 HTML 模板格式

单一 `index.html`，Vite build 时根据 `__MOBILE__` 选择不同入口 tsx：

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="<!--LOCALE-->" dir="<!--DIR-->">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!--SEO_META-->
</head>
<body>
  <div id="root"></div>
  <script>window.__SERVER_CONFIG__ = undefined; /* SERVER_CONFIG */</script>
  <!--ANALYTICS_SCRIPTS-->
  <script type="module" src="/src/entry.desktop.tsx"></script>
</body>
</html>
```

> 注：mobile build 时通过 Vite `rollupOptions.input` 或条件脚本指向 `entry.mobile.tsx`。`window.__SERVER_CONFIG__` 的占位在 prod 由 Next.js catch-all route 替换注入。

### 2.4 SPA 入口文件

```tsx
// entry.desktop.tsx
import { BrowserRouter, Routes } from 'react-router-dom';
import { renderRoutes } from '@/utils/router';
import { desktopRoutes } from '@/app/[variants]/router/desktopRouter.config';
import { SPAGlobalProvider } from '@/layout/SPAGlobalProvider';  // 新建，不修改现有 GlobalProvider

const App = () => (
  <SPAGlobalProvider>
    <BrowserRouter>
      <Routes>{renderRoutes(desktopRoutes)}</Routes>
    </BrowserRouter>
  </SPAGlobalProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

### 2.5 开发代理配置

```ts
// vite.config.ts server.proxy
server: {
  proxy: {
    '/api': 'http://localhost:3010',
    '/trpc': 'http://localhost:3010',
    '/webapi': 'http://localhost:3010',
    '/oidc': 'http://localhost:3010',
  },
},
```

**验证**：`bun run dev:spa` 启动 Vite dev server，能看到基础布局壳。

---

## Phase 3: 第一方包 Next.js 解耦

**目标**：使 packages 在无 Next runtime 环境下可编译。

### 3.1 `packages/builtin-tool-web-browsing`

4 文件引用 `next/link`（`Result.tsx`、`SearchResultItem.tsx`、`Loading.tsx`、`PageContent/index.tsx`）。

**操作**：改为从 `react-router-dom` 导入 `Link`，或创建 adapter：
```tsx
// packages/builtin-tool-web-browsing/src/client/Link.tsx
export { Link } from 'react-router-dom';
```

### 3.2 `packages/builtin-tool-agent-builder`

1 文件引用 `next/image`（`InstallPlugin.tsx`，使用 `<Image unoptimized />`）。

**操作**：`unoptimized` 的 `next/image` 等价于 `<img>`，直接替换。

### 3.3 `packages/const` 和 `packages/builtin-tool-*`

3 文件引用 `process.env.NEXT_PUBLIC_IS_DESKTOP_APP`。

**操作**：Phase 2 中 Vite define 已处理。后续统一改为从共享 const 导入：
```ts
// packages/const/src/version.ts
export const isDesktop = typeof import.meta !== 'undefined'
  ? import.meta.env?.VITE_IS_DESKTOP_APP === '1'
  : process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';  // 兼容 Next 后端
```

### 3.4 `packages/utils/src/server/`

`responsive.ts` 和 `auth.ts` 引用 `next/headers`。仅服务端使用，**无需改动**。

**验证**：Vite SPA 工程能 `import` 这些 packages 并编译通过。

---

## Phase 4: Next.js 抽象层替换

**目标**：将 `src/libs/next/` 的 wrapper 指向非 Next 实现。

### 4.1 `navigation.ts`

现有导出 → 替换为：

| 导出 | 替换 |
|---|---|
| `useRouter` | `react-router-dom` 的 `useNavigate` 封装（兼容 `.push()/.replace()/.back()` API） |
| `usePathname` | `react-router-dom` 的 `useLocation().pathname` |
| `useSearchParams` | `react-router-dom` 的 `useSearchParams` |
| `useParams` | `react-router-dom` 的 `useParams` |
| `redirect` | `react-router-dom` 的 `Navigate` 组件或 `useNavigate` |
| `notFound` | 自定义 throw（SPA 内由 ErrorBoundary 捕获） |

**关键文件**：`src/libs/next/navigation.ts`

> **注意**：`(auth)` 页面仍运行在 Next.js 环境中，不能使用 `src/libs/next/` wrapper（替换后指向 react-router-dom）。需将 `(auth)` 下引用 `@/libs/next/navigation` 的地方改为直接 `import { useRouter, usePathname, ... } from 'next/navigation'`，确保 auth 页面在 Next.js 中正常工作。

### 4.2 `Link.tsx`

替换为 `react-router-dom` 的 `Link`。注意 `next/link` 的 `href` prop 在 react-router-dom 中为 `to`。

**关键文件**：`src/libs/next/Link.tsx`
**影响范围**：需检查所有 `import Link from '@/libs/next'` 的用法中 prop 差异

### 4.3 `Image.tsx`

替换为 `<img>` 标签。现有 `next/image` 的 `fill`/`sizes`/`priority` 等 prop 需要适配或移除。

**关键文件**：`src/libs/next/Image.tsx`

### 4.4 `dynamic.tsx`

替换为 `React.lazy + Suspense`。项目已有 `src/utils/router.tsx` 的 `dynamicElement` 工具可参考。

**关键文件**：`src/libs/next/dynamic.tsx`

**验证**：Vite SPA 中所有页面路由可正常加载。

---

## Phase 5: 新建 SPAGlobalProvider

**目标**：新建 `SPAGlobalProvider`，不修改现有 `GlobalProvider`（因为 Next.js 的 `(auth)` segment 仍在使用）。从 `window.__SERVER_CONFIG__` 读取初始配置，并包含 `BetterAuthProvider` 以确保 user session 可用。

### 5.1 新建 `SPAGlobalProvider`

现有 `GlobalProvider` 是 async Server Component，SPA 无法使用。新建纯客户端版本：

```tsx
// src/layout/SPAGlobalProvider/index.tsx
import AuthProvider from '@/layout/AuthProvider';

const SPAGlobalProvider: FC<PropsWithChildren> = ({ children }) => {
  const serverConfig = window.__SERVER_CONFIG__;
  return (
    <StyleRegistry>
      <Locale antdLocale={...} defaultLang={serverConfig.locale}>
        <NextThemeProvider>
          <AppTheme
            customFontFamily={serverConfig.theme.customFontFamily}
            customFontURL={serverConfig.theme.customFontURL}
            globalCDN={serverConfig.theme.cdnUseGlobal}
          >
            <ServerConfigStoreProvider
              featureFlags={serverConfig.featureFlags}
              isMobile={serverConfig.isMobile}
              serverConfig={serverConfig.config}
            >
              <QueryProvider>
                <AuthProvider>  {/* 包含 BetterAuthProvider，确保 user session 可用 */}
                  <StoreInitialization />
                  {/* ... 其余 Provider 树同 GlobalProvider ... */}
                  {children}
                </AuthProvider>
              </QueryProvider>
            </ServerConfigStoreProvider>
          </AppTheme>
        </NextThemeProvider>
      </Locale>
    </StyleRegistry>
  );
};
```

> **重要**：必须包裹 `AuthProvider`（内部根据环境选择 `BetterAuthProvider`），否则 SPA 中无法获取 user session。

### 5.2 `window.__SERVER_CONFIG__` 类型定义

写到 `src/types/global.d.ts`，同时声明 Vite `define` 注入的变量：

```ts
// src/types/global.d.ts
import type { SPAServerConfig } from '@/types/spaServerConfig';

declare global {
  interface Window {
    __SERVER_CONFIG__: SPAServerConfig;
  }

  /** Vite define 注入，标识当前 bundle 是否为 mobile 版 */
  const __MOBILE__: boolean;
}
```

### 5.3 Analytics 改造

现状：`Analytics/index.tsx` 是 Server Component，读取 `analyticsEnv` 后传 props 给 client 组件。

改为：从 `window.__SERVER_CONFIG__.analyticsConfig` 读取，各 analytics 组件改为纯客户端：
- 移除 `next/script` 依赖 → 用 `useEffect` + `document.createElement('script')` 动态插入
- 或使用 `react-helmet-async`

**关键文件**：
- 新增 `src/layout/SPAGlobalProvider/index.tsx`
- 新增 `src/types/global.d.ts`（`Window.__SERVER_CONFIG__` + `__MOBILE__` 类型声明）
- `src/store/serverConfig/Provider.tsx`
- `src/components/Analytics/*.tsx`
- 现有 `src/layout/GlobalProvider/index.tsx` **不修改**

**验证**：SPA 启动后 Zustand store 正确初始化 serverConfig；user session 正常拉取。

---

## Phase 6: Next.js Catch-All Route 实现

**目标**：Next.js 后端提供 catch-all route，读取 Vite 产出的 HTML 模板并注入运行时数据。

### 6.1 Route Handler

参考实现：`catch-all.eg.ts`

```
src/app/(spa)/[...path]/route.ts   # catch-all，优先级低于 (backend)/*
```

**核心逻辑（dev / prod 分离）**：

- **prod**：读取 Vite 构建产物的 HTML string template（`dist/desktop/index.html` / `dist/mobile/index.html`），进行字符串替换后返回
- **dev**：代理 Vite dev server（`fetch(VITE_DEV_ORIGIN)`），获取 HTML 后 rewrite 资源 URL 指向 Vite dev server origin（处理 script src、link href、inline module scripts、Worker 跨域）

```ts
// 伪代码
async function getTemplate(isMobile: boolean): Promise<string> {
  if (isDev) {
    // 代理 Vite dev server HTML，rewrite 资源 URL
    const res = await fetch(VITE_DEV_ORIGIN);
    const html = await res.text();
    return rewriteViteAssetUrls(html);
  }
  // prod：读取预构建的 string template
  return isMobile ? mobileHtmlTemplate : desktopHtmlTemplate;
}
```

完整流程：
1. 读取 UA → 选 desktop / mobile template
2. 读取 cookie/headers → 解析 locale
3. 调用 `getServerGlobalConfig()` → 构建 `SPAServerConfig`
4. 安全序列化 + 正则替换 `window.__SERVER_CONFIG__` 占位
5. `new Response(html, { headers })`

### 6.2 安全序列化

已有实现 `src/server/utils/serializeForHtml.ts`，直接复用。

### 6.3 缓存策略

```ts
headers: {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-cache, no-store, must-revalidate',
  'vary': 'Accept-Language, User-Agent, Cookie',
}
```

`public/spa/assets/*`（JS/CSS）由 Next.js 自动静态服务，Vite content hash 保证可强缓存。

### 6.4 Middleware 适配

`src/libs/next/proxy/define-config.ts` 中的 SPA 路由白名单改为放行到 catch-all route（不再 rewrite 到 `[variants]`）。

**关键文件**：
- 新增 `src/app/(spa)/[...path]/route.ts`
- 修改 `src/libs/next/proxy/define-config.ts`

**验证**：`next dev` + 访问 `/agent`，返回 Vite 产出的 HTML（含注入的 locale/config）。

---

## Phase 7: Auth 页面处理

### 7.1 `(auth)` route group 保留 Next.js App Router

`(auth)` 下的所有页面**不迁入 SPA**，保持为 Next.js App Router 页面。原因：
- Auth 页面需要服务端能力（redirect、OIDC session lookup 等）
- 现有 GlobalProvider 仍为这些页面服务

**操作**：页面组件内的 router hook 统一使用 `next/navigation`（而非 `react-router-dom`），确保在 Next.js 环境下正常运行。

### 7.2 Catch-All Route 排除 Auth 路径

catch-all route 排除所有 auth 相关路径，让 Next.js App Router 正常接管：
- `/signin`、`/signup`、`/auth-error`、`/reset-password`、`/verify-email`
- `/oauth/consent/*`、`/oauth/callback/*`
- `/market-auth-callback`

### 7.3 Middleware auth 检查适配

`betterAuthMiddleware` 的 session 检查对 SPA 路由需调整：
- SPA 页面全量 public（HTML 本身无敏感数据）
- 登录态检查由 SPA 内部 route guard 负责（SPAGlobalProvider 中的 AuthProvider/BetterAuthProvider）
- `/api/*`、`/trpc/*`、`/oidc/*` 的鉴权保持不变
- Auth 页面继续由 Next.js middleware 保护

**关键文件**：
- `src/app/[variants]/(auth)/` — 不动，保持 Next.js
- `src/libs/next/proxy/define-config.ts` — 排除 auth 路径

---

## Phase 8: 第三方依赖迁移

| 依赖 | 用途 | 文件 | 迁移 |
|---|---|---|---|
| `nuqs/adapters/next/app` | Auth 页面 query state | `(auth)/layout.tsx` | Phase 7 已移除 |
| `@vercel/speed-insights/next` | Vercel 性能监控 | `[variants]/layout.tsx` | 改用 `@vercel/speed-insights` 的 vanilla 版本，或移除 |
| `next-mdx-remote/rsc` | MDX 渲染 | `src/components/mdx/index.tsx` | 改用 `@mdx-js/rollup`（Vite plugin）或运行时 MDX 解析 |
| `@next/third-parties/google` | GA4 | `Analytics/Google.tsx` | 用 `<script>` 直接注入 gtag |
| `react-scan/monitoring/next` | React 性能调试 | `Analytics/ReactScan.tsx` | 改用 `react-scan` 的通用版本 |
| `@serwist/next` | PWA/Service Worker | `sw.ts` + `define-config.ts` | 改用 `vite-plugin-pwa`（Workbox 封装） |
| `@t3-oss/env-nextjs` | 环境变量校验 | `src/envs/*.ts` | 改用 `@t3-oss/env-core`（框架无关版） |

**关键文件**：
- `src/components/mdx/index.tsx`
- `src/components/Analytics/*.tsx`
- `src/envs/*.ts`（6 个文件）
- `src/app/sw.ts`（改用 `vite-plugin-pwa` 集成）

---

## Phase 9: 构建集成与产物组织

### 9.1 Vite 构建产物

两次 build 分别产出：

```
dist/
├── desktop/
│   ├── index.html          # desktop 入口模板
│   └── assets/             # JS/CSS（content hash）
└── mobile/
    ├── index.html          # mobile 入口模板
    └── assets/
```

### 9.2 构建脚本

```jsonc
// package.json scripts
{
  "build:spa": "vite build && MOBILE=true vite build",
  "build:spa:copy": "cp -r dist/* public/spa/",
  "build:docker": "bun run build:spa && bun run build:spa:copy && DOCKER=true next build --webpack",
  "dev:spa": "vite",
  "dev": "bun run dev:spa"  // 默认开发命令改为 Vite
}
```

### 9.3 Dockerfile 适配

```dockerfile
# builder stage
RUN bun run build:spa          # 先构建两个 SPA bundle
RUN cp -r dist/* public/spa/
RUN bun run build:docker       # 再构建 Next.js（后端 + 托管）
```

### 9.4 `robots.tsx` / `sitemap.tsx` / `manifest.ts`

保留在 Next.js 中不变（属于后端/SEO 能力）。

**验证**：`bun run build:spa && bun run build:docker` 完成；Docker 镜像可运行；访问 `/agent` 返回 SPA 页面。

---

## Phase 10: 清理与收敛

### 10.1 删除旧前端壳（最小化变动）

仅删除 `src/app/[variants]/` 下的 Next.js route segment 文件，**排除 `(auth)` 目录**：
- 删除 `src/app/[variants]/page.tsx`、`layout.tsx`、`loading.tsx`、`metadata.ts` 等 route segment 文件
- 删除 `src/app/[variants]/` 下其他非 `(auth)` 的 Next.js page/layout
- **保留** `src/app/[variants]/(auth)/` 整个目录不动
- 删除 `src/app/loading.tsx`
- 删除 `src/libs/next/proxy/` 中 SPA 相关的 rewrite 逻辑（保留 API 代理）

### 10.2 精简 Next.js 依赖

- `next.config.ts`：移除 `withPWA`、前端相关 webpack 配置（emotion、optimizePackageImports 等）
- 移除 `@serwist/next`、`@next/bundle-analyzer`（前端侧）

### 10.3 开发命令收敛

- 纯前端开发：`pnpm dev:spa`（仅 Vite）
- 前后端联调：`pnpm dev:spa` + `pnpm dev:next`（Vite 代理到 Next）
- 生产构建：`pnpm build:spa` → copy → `pnpm build:docker`

### 10.4 Desktop Electron 适配（本次不做）

Desktop 构建流程暂保持不变，后续单独 PR 适配：
- `scripts/electronWorkflow/modifiers/` 暂不改动
- 确保本次迁移不破坏 desktop 构建的前提：`src/` 目录结构变化需要与 modifier 脚本的文件路径假设兼容
- 若不兼容，在 Phase 10 前与 desktop 维护者沟通确认

---

## 验证策略

### 每个 Phase 的验证

| Phase | 验证方式 |
|---|---|
| 1 | `bun run type-check` 通过；功能回归无影响 |
| 2 | `bun run dev:spa` 启动 Vite dev server，浏览器可见页面壳 |
| 3 | SPA 工程能 import 所有 packages 并编译通过 |
| 4 | SPA 中页面路由跳转正常，Link/Image/dynamic 替代品工作正常 |
| 5 | SPA 启动后 Zustand store 正确初始化 serverConfig；user session 正常拉取 |
| 6 | `next dev` 访问 `/agent` 返回注入后的 HTML，SPA 正常渲染 |
| 7 | Auth 页面在 Next.js App Router 中正常工作；catch-all 正确排除 auth 路径 |
| 8 | Analytics 脚本加载、MDX 渲染、PWA 安装正常 |
| 9 | Docker 镜像构建成功；线上访问 SPA + API 均正常 |
| 10 | 旧代码已删；`pnpm dev:spa` 为默认开发命令；desktop 构建正常 |

### 端到端验证

- 本地：`pnpm dev:spa` 纯前端开发（不启动 Next），验证页面渲染、路由、热更新
- 联调：`pnpm dev:spa` + `next dev`，验证 API 调用、tRPC、Auth 流程
- Docker：构建镜像 → 运行 → 验证全量功能（含 locale 切换、mobile UA 切换、OAuth 流程）
- Desktop：`pnpm desktop:build:renderer` → 验证 Electron 构建不受影响

---

## 风险与注意事项

1. **`process.env` 在 Vite 中不可用**：Vite 不注入 `process.env`，所有客户端代码中的 `process.env.*` 需改为 `import.meta.env.*` 或 `window.__SERVER_CONFIG__`。可通过 Vite define 提供兼容层，但建议逐步替换。
2. **Emotion SSR**：当前 Next.js 有 `compiler.emotion` 支持。Vite 侧需配置 `@emotion/babel-plugin`（通过 `@vitejs/plugin-react` 的 `babel` 选项）。
3. **i18n / locale 在 Vite 中需要独立实现**：Vite 不支持 Next.js 式的 `import()` 动态路径，需改用 `import.meta.glob` 静态分析。已有 Vite 版实现：
   - `src/utils/locale.vite.ts` — antd locale 加载（`import.meta.glob` 读取 `antd/es/locale/*.js`）
   - `src/utils/i18n/loadI18nNamespaceModule.vite.ts` — i18n namespace 加载（`import.meta.glob` 读取 `locales/` 目录）

   Vite build 时需通过 alias 或条件导入将这些 `.vite.ts` 版本替换掉原版（如在 `vite.config.ts` 的 `resolve.alias` 中映射）。
4. **Circular dependency**：现有 `pnpm circular` 检查需在 SPA 工程中同步验证。
5. **Desktop Electron 构建**：本次不动 desktop，但需确保 `src/` 结构变化不破坏 modifier 脚本。删除 `src/app/[variants]/` 会导致 desktop modifier 失效——因此 Phase 10 清理需在 desktop 适配 PR 之后，或保留 `[variants]` 目录结构作为 desktop 构建入口直到 desktop 迁移完成。
