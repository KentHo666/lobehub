import type { PluginOption } from 'vite';

import tsconfigPaths from 'vite-tsconfig-paths';

import { viteNodeModuleStub } from './nodeModuleStub';
import { vitePlatformResolve } from './platformResolve';

type Platform = 'web' | 'mobile' | 'desktop';

interface SharedRendererPluginsOptions {
  platform: Platform;
  tsconfigRoot?: string;
}

export function sharedRendererPlugins(options: SharedRendererPluginsOptions): PluginOption[] {
  return [
    viteNodeModuleStub(),
    vitePlatformResolve(options.platform),
    tsconfigPaths(options.tsconfigRoot ? { root: options.tsconfigRoot } : undefined),
  ];
}

export function sharedRendererDefine(options: { isElectron: boolean; isMobile: boolean }) {
  return {
    '__ELECTRON__': JSON.stringify(options.isElectron),
    '__MOBILE__': JSON.stringify(options.isMobile),
    'process.env': '{}',
  };
}
