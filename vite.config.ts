import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { viteNodeModuleStub } from './plugins/vite/nodeModuleStub';
import { vitePlatformResolve } from './plugins/vite/platformResolve';

const isMobile = process.env.MOBILE === 'true';
const isDev = process.env.NODE_ENV !== 'production';
const isElectron = process.env.DESKTOP_BUILD === 'true';
const root = resolve(__dirname);

// Workspace package: force browser conditional export (bypassed by tsconfigPaths/pnpm symlink)
const ssrfSafeFetchRedirect: [string, string] = [
  resolve(root, 'packages/ssrf-safe-fetch/index.ts'),
  resolve(root, 'packages/ssrf-safe-fetch/index.browser.ts'),
];

function viteSsrfSafeFetchRedirect(): Plugin {
  return {
    enforce: 'pre',
    name: 'vite-ssrf-safe-fetch-redirect',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;

      const cleanId = resolved.id.split('?')[0];
      if (cleanId === ssrfSafeFetchRedirect[0]) return ssrfSafeFetchRedirect[1];
      return null;
    },
  };
}

export default defineConfig({
  base: isDev ? '/' : '/spa/',
  build: {
    outDir: isMobile ? 'dist/mobile' : 'dist/desktop',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  define: {
    '__MOBILE__': JSON.stringify(isMobile),
    'process.env.NEXT_PUBLIC_IS_DESKTOP_APP': JSON.stringify(isElectron ? '1' : '0'),
  },
  plugins: [
    viteNodeModuleStub(),
    vitePlatformResolve(isMobile ? 'mobile' : isElectron ? 'desktop' : 'web'),
    viteSsrfSafeFetchRedirect(),
    tsconfigPaths(),
    react({ jsxImportSource: '@emotion/react' }),
  ],

  server: {
    port: 3011,
    proxy: {
      '/api': 'http://localhost:3010',
      '/oidc': 'http://localhost:3010',
      '/trpc': 'http://localhost:3010',
      '/webapi': 'http://localhost:3010',
    },
  },
});
