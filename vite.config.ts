import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const isMobile = process.env.MOBILE === 'true';
const isDev = process.env.NODE_ENV !== 'production';

const root = resolve(__dirname);

const viteModuleRedirects: [string, string][] = [
  ['src/utils/locale.ts', 'src/utils/locale.vite.ts'],
  ['src/utils/i18n/loadI18nNamespaceModule.ts', 'src/utils/i18n/loadI18nNamespaceModule.vite.ts'],
  ['src/libs/getUILocaleAndResources.ts', 'src/libs/getUILocaleAndResources.vite.ts'],
  ['src/components/mdx/Image.tsx', 'src/components/mdx/Image.vite.tsx'],
  ['src/layout/AuthProvider/index.tsx', 'src/layout/AuthProvider/index.vite.tsx'],
  ['src/components/Analytics/LobeAnalyticsProviderWrapper.tsx', 'src/components/Analytics/LobeAnalyticsProviderWrapper.vite.tsx'],
  ['src/libs/next/navigation.ts', 'src/libs/next/navigation.vite.ts'],
].map(([from, to]) => [resolve(root, from), resolve(root, to)]);

function viteModuleRedirect(): Plugin {
  return {
    enforce: 'pre',
    name: 'vite-module-redirect',
    async resolveId(source, importer, options) {
      if (source.includes('.vite')) return null;

      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;

      const cleanId = resolved.id.split('?')[0];
      for (const [from, to] of viteModuleRedirects) {
        if (cleanId === from) return to;
      }
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
    'process.env.NEXT_PUBLIC_IS_DESKTOP_APP': JSON.stringify('0'),
  },
  plugins: [viteModuleRedirect(), tsconfigPaths(), react({ jsxImportSource: '@emotion/react' })],

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
