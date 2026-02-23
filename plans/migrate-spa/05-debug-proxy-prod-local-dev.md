# Plan: Debug Proxy — 线上域名调试本地 Dev Server

## Context

### 需求

开发者需要在**线上生产域名**下直接调试本地 Vite dev server 的代码，享有：

- **线上 origin 的 cookie/auth/CORS** — 无需本地搭建完整后端，API 请求自动携带线上凭证
- **本地 HMR 热更新** — 修改代码即时生效
- **真实生产环境** — 可复现线上才出现的问题（CORS 策略、CDN 行为、auth 流程等）

### 与现有 dev 模式的区别

| 维度        | 现有 `next dev` + `vite dev` 联调        | Debug Proxy                             |
| ----------- | ---------------------------------------- | --------------------------------------- |
| 运行位置    | 本地 `localhost:3010` + `localhost:3011` | 浏览器打开线上域名                      |
| 后端        | 本地 Next.js server                      | **线上生产 API**                        |
| Auth/Cookie | 本地 session（需单独配置）               | **线上真实 session**                    |
| 前端        | 本地 Vite dev server                     | 本地 Vite dev server（通过 proxy 加载） |
| 适用场景    | 日常开发                                 | 调试线上问题、验证线上环境行为          |

### 参考实现

Folo 项目的 `debug_proxy.html`：在 Electron renderer 中加载远端 Vite dev server 内容，通过 fetch + DOM 解析 + script rebase 实现。本方案将此模式泛化为 Web 通用方案。

---

## Phase 1: 创建 Debug Proxy Next.js Route

**目标**：新增 Next.js catch-all route `/__dangerous_local_dev_proxy/`，部署到线上后可通过 URL 参数指定本地 dev server 地址，加载本地 bundle。使用 catch-all 使 SPA 客户端路由刷新时仍返回同一 HTML。

### 1.1 新增 `src/app/__dangerous_local_dev_proxy/[[...path]]/route.ts`

- `export const dynamic = 'force-static'` — 构建时静态生成，无运行时开销
- `GET()` 返回内联 HTML，包含：
  1. 解析 `?debug-host=` 参数，fallback sessionStorage → 默认 `localhost:3011`
  2. Worker 跨域补丁（在任何模块加载前注入）
  3. React Refresh runtime 注入
  4. fetch 线上 `/spa/{locale}/chat` 提取 `__SERVER_CONFIG__`
  5. fetch 本地 dev server HTML，解析 DOM，rebase scripts/styles 到 dev server origin

### 1.2 关键设计说明

| 要点                       | 说明                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| **路径命名**               | `__dangerous_local_dev_proxy` — 下划线前缀 + dangerous 命名，明确表达风险性 |
| **catch-all**              | `[[...path]]` — SPA 客户端路由刷新时返回同一 HTML                           |
| **force-static**           | 构建时生成静态响应，无服务端运行时成本                                      |
| **host 来源**              | URL 参数 `?debug-host=` > sessionStorage 缓存 > 默认 `localhost:3011`       |
| **sessionStorage 持久化**  | 首次设置后刷新无需再带参数；`?reset` 可清除                                 |
| **React Refresh**          | 必须在 app bundle 加载前注入，否则 HMR 不生效                               |
| **Script rebase**          | 所有 `<script src>` 的相对路径重写为 dev server 绝对 URL                    |
| **内联 script rewrite**    | `from "/xxx"` 形式的 ESM import 路径也需 rebase                             |
| **Worker 补丁**            | dev server 与线上不同源，Worker 需通过 Blob URL 中转                        |
| **`__SERVER_CONFIG__`**    | 从线上 SPA route 的 HTML 中提取，确保 app 初始化时有完整配置                |
| **`__DEBUG_PROXY__` 标志** | 供运行时判断是否处于 debug proxy 模式（如需差异化行为）                     |

---

## Phase 2: Vite Dev Server CORS 配置

**目标**：确保本地 Vite dev server 允许线上域名跨域 fetch 其资源。

### 2.1 修改 `vite.config.ts`

在 `server` 配置中添加 CORS 支持：

```typescript
server: {
  cors: true, // 允许任意 origin 跨域请求（dev only）
  port: 3011,
  // ... 现有 proxy 配置
},
```

> `cors: true` 在 Vite dev server 中等价于 `Access-Control-Allow-Origin: *`，仅影响开发环境。

### 2.2 验证

从线上域名打开 `/__dangerous_local_dev_proxy/?debug-host=http://localhost:3011`，浏览器 Network 面板无 CORS 错误。

---

## Phase 3: API 请求路径处理

**目标**：确保 SPA 在 debug proxy 模式下的 API 请求正确发往线上 origin。

### 3.1 分析现有 API 路径

SPA 中的 API 调用使用相对路径：`/api/*`、`/trpc/*`、`/webapi/*`、`/oidc/*`。

- 在 debug proxy 模式下，浏览器 origin 为线上域名（如 `https://app.lobehub.com`）
- 相对路径 `/api/xxx` 会自动发往 `https://app.lobehub.com/api/xxx` — **天然正确**
- **无需任何改动**，API 请求自然携带线上 cookie

### 3.2 Vite HMR WebSocket 连接

Vite dev server 的 HMR 通过 WebSocket 连接到 `localhost:3011`。在 debug proxy 模式下，Vite client 需要知道 WS 地址。

**Vite 默认行为**：当 `<script src="http://localhost:3011/xxx">` 加载时，Vite client 会从 `import.meta.url` 推断 WS 地址为 `ws://localhost:3011`，**无需额外配置**。

---

## Phase 4: `__DEBUG_PROXY__` 全局标志

**目标**：在运行时提供一个标志，供 app 代码判断是否处于 debug proxy 模式。

### 4.1 类型声明

在 `src/types/global.d.ts` 中添加：

```typescript
/** Set by debug-proxy when loading local dev server on production domain */
const __DEBUG_PROXY__: boolean | undefined;
```

### 4.2 潜在用途

- 关闭 Service Worker 注册（SW 会拦截请求，干扰 debug proxy）
- 调整 analytics 行为（避免污染线上数据）
- 在 UI 中显示 debug 标识

**本 Plan 不预设具体用途**，仅提供标志位。后续按需在代码中检查 `globalThis.__DEBUG_PROXY__`。

---

## 变更总结

| 文件                                                       | 操作                                       | Phase |
| ---------------------------------------------------------- | ------------------------------------------ | ----- |
| `src/app/__dangerous_local_dev_proxy/[[...path]]/route.ts` | **新增** — Debug Proxy catch-all route     | 1     |
| `vite.config.ts`                                           | **修改** — 添加 `cors: true`               | 2     |
| `src/types/global.d.ts`                                    | **修改** — 添加 `__DEBUG_PROXY__` 类型声明 | 4     |

**净增**：1 个 Next.js route handler + 2 行配置改动。零运行时侵入。

---

## 使用方式

```
1. 本地启动 Vite dev server: bun run dev:spa
2. 打开线上域名: https://app.lobehub.com/__dangerous_local_dev_proxy/?debug-host=http://localhost:3011
3. 完成。线上 cookie/auth 自动生效，本地代码 HMR 热更新可用。

参数：
- ?debug-host=http://localhost:3011  — 指定本地 dev server 地址（首次设置后缓存到 sessionStorage）
- ?reset                             — 清除 sessionStorage 中缓存的 debug-host
```

---

## 注意事项

1. **HTTPS ↔ HTTP Mixed Content**：线上 HTTPS 域名 fetch `http://localhost` 会被浏览器阻止。解决方案：
   - Chrome: 地址栏盾牌图标 → 允许不安全内容
   - 或本地 dev server 使用 HTTPS（`vite --https` 或 `mkcert` 自签证书）

2. **`__SERVER_CONFIG__` 竞态**：debug proxy 中 config 通过异步 fetch 获取，可能晚于 app 初始化。需确保 `SPAGlobalProvider` 能处理 `window.__SERVER_CONFIG__` 为 `undefined` 的初始状态（等待加载完成后再渲染）。如现有代码已处理则无需改动。

3. **Service Worker**：若线上已注册 SW，它可能拦截对 `localhost` 的请求。debug proxy 模式下应考虑跳过 SW 注册，或在 SW 中判断 `__DEBUG_PROXY__` 标志。

4. **安全性**：路径名 `__dangerous_local_dev_proxy` 已明确表达风险性。该 route 不含敏感数据，仅是一个加载器。恶意用户可通过 `?debug-host=` 指向恶意服务器，但风险等同于在控制台执行任意 JS — 属于自损行为，不构成对其他用户的安全威胁。
