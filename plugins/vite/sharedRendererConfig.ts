import react from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import tsconfigPaths from 'vite-tsconfig-paths';

import { viteNodeModuleStub } from './nodeModuleStub';
import { vitePlatformResolve } from './platformResolve';

type Platform = 'web' | 'mobile' | 'desktop';

const isDev = process.env.NODE_ENV !== 'production';

interface SharedRendererOptions {
  platform: Platform;
}

export function sharedRendererPlugins(options: SharedRendererOptions) {
  return [
    viteNodeModuleStub(),
    vitePlatformResolve(options.platform),
    tsconfigPaths(),
    isDev &&
      codeInspectorPlugin({
        bundler: 'vite',
        exclude: [/\.(css|json)$/],
        hotKeys: ['altKey', 'ctrlKey'],
      }),
    react(),
  ];
}

export function sharedRendererDefine(options: { isElectron: boolean; isMobile: boolean }) {
  return {
    '__ELECTRON__': JSON.stringify(options.isElectron),
    '__MOBILE__': JSON.stringify(options.isMobile),
    'process.env': '{}',
  };
}

export const sharedOptimizeDeps = {
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
};
