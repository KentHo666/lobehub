import type { Plugin } from 'vite';

/**
 * Prevents Node.js-only modules from being bundled into the SPA browser build.
 *
 * - `node:stream`: dynamically imported in azureai provider behind `typeof window === 'undefined'`
 *   guard — dead code in browser but Rollup still resolves it.
 * - `@lobehub/chat-plugin-sdk/openapi`: dynamically imported in toolManifest, pulls in
 *   @apidevtools/swagger-parser which depends on Node built-ins (util, path).
 */
export function viteNodeModuleStub(): Plugin {
  const stubbedModules = new Set([
    'node:stream',
    '@lobehub/chat-plugin-sdk/openapi',
  ]);
  const VIRTUAL_PREFIX = '\0node-stub:';

  return {
    enforce: 'pre',
    load(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) return 'export default {};';
      return null;
    },
    name: 'vite-node-module-stub',
    resolveId(source) {
      if (stubbedModules.has(source)) {
        return { id: `${VIRTUAL_PREFIX}${source}`, moduleSideEffects: false };
      }
      return null;
    },
  };
}
