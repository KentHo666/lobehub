import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import { defineConfig } from 'vite';

import { sharedRendererDefine, sharedRendererPlugins } from './plugins/vite/sharedRendererConfig';

const isMobile = process.env.MOBILE === 'true';
const isDev = process.env.NODE_ENV !== 'production';
const isElectron = process.env.DESKTOP_BUILD === 'true';
const platform = isMobile ? 'mobile' : isElectron ? 'desktop' : 'web';

export default defineConfig({
  base: isDev ? '/' : '/spa/',
  build: {
    outDir: isMobile ? 'dist/mobile' : 'dist/desktop',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  define: sharedRendererDefine({ isMobile, isElectron }),
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
    ...sharedRendererPlugins({ platform }),
    isDev &&
      codeInspectorPlugin({
        bundler: 'vite',
        exclude: [/\.(css|json)$/],
        hotKeys: ['altKey', 'ctrlKey'],
      }),
    react(),
  ],

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
