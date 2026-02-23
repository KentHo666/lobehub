# Migrate SPA — Plan Outline

本目录为 **Next.js App Router → Vite SPA + Electron 适配** 的迁移方案集合，按执行顺序组织。

## 文档顺序与概要

| 序号 | 文件                                                                               | 说明                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [01-nextjs-vite-spa-migration.md](./01-nextjs-vite-spa-migration.md)               | **主方案**：Next.js 前端迁至 Vite + React Router SPA，后端保留 Next.js；环境变量、抽象层、catch-all、Auth 保留、构建集成与清理                                                                          |
| 2    | [02-serverconfig-turborepo-dev.md](./02-serverconfig-turborepo-dev.md)             | **Turborepo + ServerConfig**：SPAServerConfig 精简（移除 locale/theme）；catch-all 加 `[locale]` 段、force-static、SEO meta；index.html 前置 locale 检测；turborepo dev 集成                            |
| 3    | [03-electron-vite-renderer-migration.md](./03-electron-vite-renderer-migration.md) | **Electron Renderer 构建**：删除所有 modifier 脚本；electron-vite 增加 renderer entry，复用 Vite 插件与 `.desktop` 差异化；主进程 / 打包 / 清理；统一 `__ELECTRON__`、移除 `NEXT_PUBLIC_IS_DESKTOP_APP` |
| 4    | [04-renderer-url-manager-adapt.md](./04-renderer-url-manager-adapt.md)             | **Renderer URL 管理**：RendererUrlManager 适配 electron-vite，读取 `ELECTRON_RENDERER_URL` 替代硬编码；清理 Next.js 残留引用与测试更新                                                                  |
| 5    | [05-debug-proxy-prod-local-dev.md](./05-debug-proxy-prod-local-dev.md)             | **线上调试本地 Dev**：Next.js 路由 `/__dangerous_local_dev_proxy/` 实现线上域名加载本地 Vite dev server，CORS、API 路径、`__DEBUG_PROXY__` 标志                                                         |

## 依赖关系

- **01** 是 Web 端 SPA 迁移的主线，**02** 在其上做 ServerConfig 与 Turborepo 的收敛。
- **03** 依赖 01/02 的 SPA 产物与构建流程，将 Desktop Renderer 从 Next export 迁至 electron-vite。
- **04** 依赖 03，在 Renderer 已由 electron-vite 提供的前提下，让主进程的 URL 管理与之对齐。
- **05** 独立于 Electron，用于在线上域名下调试本地 Vite dev，可与 01/02 并行或之后实施。

## 建议执行顺序

1. 按 01 → 02 完成 Web SPA 迁移与收敛。
2. 按 03 → 04 完成 Electron Renderer 与主进程适配。
3. 按需实施 05（线上调试本地 dev）。
