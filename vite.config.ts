import { resolve } from 'node:path';

import type { PluginOption } from 'vite';
import { defineConfig } from 'vite';

import {
  sharedOptimizeDeps,
  sharedRendererDefine,
  sharedRendererPlugins,
} from './plugins/vite/sharedRendererConfig';

const isMobile = process.env.MOBILE === 'true';
const isElectron = process.env.DESKTOP_BUILD === 'true';
const isDev = process.env.NODE_ENV !== 'production';
const platform = isMobile ? 'mobile' : isElectron ? 'desktop' : 'web';

export default defineConfig({
  base: isDev ? '/' : '/spa/',
  build: {
    outDir: isMobile ? 'dist/mobile' : 'dist/desktop',
    rollupOptions: {
      input: resolve(__dirname, isMobile ? 'index.mobile.html' : 'index.html'),
    },
  },
  define: sharedRendererDefine({ isMobile, isElectron }),
  optimizeDeps: sharedOptimizeDeps,
  plugins: sharedRendererPlugins({ platform }) as PluginOption[],

  server: {
    cors: true,
    port: 3011,
    proxy: {
      '/api': 'http://localhost:3010',
      '/oidc': 'http://localhost:3010',
      '/trpc': 'http://localhost:3010',
      '/webapi': 'http://localhost:3010',
    },
    warmup: {
      clientFiles: ['./src/entry.web.tsx', './src/entry.desktop.tsx', './src/entry.mobile.tsx'],
    },
  },
});
