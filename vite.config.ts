import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { viteNodeModuleStub } from './plugins/vite/nodeModuleStub';
import { vitePlatformResolve } from './plugins/vite/platformResolve';

const isMobile = process.env.MOBILE === 'true';
const isDev = process.env.NODE_ENV !== 'production';
const isElectron = process.env.DESKTOP_BUILD === 'true';

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
    '__ELECTRON__': JSON.stringify(isElectron),
    'process.env': '{}',
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'antd',
      '@ant-design/icons',
      '@lobehub/ui',
      '@lobehub/ui > @emotion/react',
      'antd-style',
      'zustand',
      'zustand/middleware',
      'swr',
      'i18next',
      'react-i18next',
      'dayjs',
      'lodash-es',
      'ahooks',
      'motion/react',

      // monorepo packages — pre-bundle to reduce request count
      '@lobechat/model-runtime',
      'model-bank',
      '@lobechat/types',
      '@lobechat/prompts',
      '@lobechat/context-engine',
      '@lobechat/utils',
      '@lobechat/const',
      '@lobechat/agent-runtime',
      '@lobechat/electron-client-ipc',
      '@lobechat/conversation-flow',
      '@lobechat/builtin-agents',
    ],
  },
  plugins: [
    viteNodeModuleStub(),
    vitePlatformResolve(isMobile ? 'mobile' : isElectron ? 'desktop' : 'web'),
    tsconfigPaths(),
    isDev &&
      codeInspectorPlugin({
        bundler: 'vite',
        exclude: [/\.(css|json)$/],
        hotKeys: ['altKey', 'ctrlKey'],
      }),
    react(),
  ],

  server: {
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
