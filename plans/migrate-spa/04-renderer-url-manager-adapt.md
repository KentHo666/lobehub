# Plan: Electron Renderer Manager 适配 electron-vite Dev Server

## Context

前序 Plan（`03-electron-vite-renderer-migration.md`）已完成 Renderer 从 Next.js static export 到 Vite SPA 的迁移。但 `RendererUrlManager` 中仍残留 Next.js 逻辑：

- **硬编码 `http://localhost:3015`** 作为 dev 模式 renderer URL，实际已不再由 Next.js 提供
- electron-vite 在 `electron-vite dev` 时自行启动 renderer Vite dev server，并通过 `process.env['ELECTRON_RENDERER_URL']` 注入 URL 到 main process
- 日志信息仍引用 "Next dev server"
- `Browser.ts` 注释仍引用 `app://next`

### 核心变更

- `RendererUrlManager.configureRendererLoader()` 读取 `process.env['ELECTRON_RENDERER_URL']` 替代硬编码端口
- 清除所有 Next.js 残留引用（日志、注释）
- 更新测试

---

## Phase 1: RendererUrlManager 适配 electron-vite

**文件**: `apps/desktop/src/main/core/infrastructure/RendererUrlManager.ts`

### 1.1 移除硬编码 URL

删除:

```typescript
const devDefaultRendererUrl = 'http://localhost:3015';
```

### 1.2 修改 `configureRendererLoader()`

原逻辑:

```typescript
configureRendererLoader() {
  if (isDev && !this.rendererStaticOverride) {
    this.rendererLoadedUrl = devDefaultRendererUrl;
    this.setupDevRenderer();
    return;
  }
  // ...
}
```

新逻辑:

```typescript
configureRendererLoader() {
  const electronRendererUrl = process.env['ELECTRON_RENDERER_URL'];

  if (isDev && !this.rendererStaticOverride && electronRendererUrl) {
    this.rendererLoadedUrl = electronRendererUrl;
    this.setupDevRenderer();
    return;
  }

  if (isDev && !this.rendererStaticOverride && !electronRendererUrl) {
    logger.warn('Dev mode: ELECTRON_RENDERER_URL not set, falling back to protocol handler');
  }

  if (isDev && this.rendererStaticOverride) {
    logger.warn('Dev mode: DESKTOP_RENDERER_STATIC enabled, using static renderer handler');
  }

  this.setupProdRenderer();
}
```

### 1.3 更新日志信息

- `setupDevRenderer()`: "renderer served from Next dev server" → "renderer served from electron-vite dev server at %URL%"
- `setupProdRenderer()`: "serve static Next export assets" → "serve static renderer assets"（注释 + 日志）

---

## Phase 2: 清理残留 Next.js 引用

### 2.1 Browser.ts 注释修正

**文件**: `apps/desktop/src/main/core/browser/Browser.ts`

Line 494 注释:

```typescript
// In production, the renderer uses app://next protocol which triggers CORS
```

改为:

```typescript
// In production, the renderer uses app://renderer protocol which triggers CORS
```

### 2.2 全局搜索验证

搜索 `apps/desktop/` 下所有 `next` 相关残留引用（排除 node_modules、dist），确认无遗漏:

- `app://next`
- `Next dev server`
- `Next export`
- `nextExport`

---

## Phase 3: 更新测试

**文件**: `apps/desktop/src/main/core/infrastructure/__tests__/RendererUrlManager.test.ts`

### 3.1 添加 dev 模式测试

新增测试用例:

1. **dev + ELECTRON_RENDERER_URL 已设置**: `buildRendererUrl('/')` 返回 `process.env.ELECTRON_RENDERER_URL + '/'`
2. **dev + ELECTRON_RENDERER_URL 未设置**: 回退到 protocol handler（`app://renderer/`）
3. **dev + DESKTOP_RENDERER_STATIC**: 无论 `ELECTRON_RENDERER_URL` 是否存在，都使用 protocol handler

需要 mock:

- `@/const/env` 的 `isDev` 为 `true`
- `process.env['ELECTRON_RENDERER_URL']` 设置 / 清除

---

## Phase 4: 验证

1. 检查 `electron-vite dev` 启动时 main process 正确读取 `ELECTRON_RENDERER_URL`
2. 检查 `DESKTOP_RENDERER_STATIC=1` 仍可强制使用 protocol handler
3. 运行 RendererUrlManager 和 RendererProtocolManager 测试
