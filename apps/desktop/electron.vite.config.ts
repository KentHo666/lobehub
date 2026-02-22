import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

import { getExternalDependencies } from './native-deps.config.mjs';

import { sharedRendererDefine, sharedRendererPlugins } from '../../plugins/vite/sharedRendererConfig';

dotenv.config();

const isDev = process.env.NODE_ENV === 'development';
const updateChannel = process.env.UPDATE_CHANNEL;
const ROOT_DIR = resolve(__dirname, '../..');

console.log(`[electron-vite.config.ts] Detected UPDATE_CHANNEL: ${updateChannel}`);

export default defineConfig({
  main: {
    build: {
      minify: !isDev,
      outDir: 'dist/main',
      rollupOptions: {
        // Native modules must be externalized to work correctly
        external: getExternalDependencies(),
        output: {
          // Prevent debug package from being bundled into index.js to avoid side-effect pollution
          manualChunks(id) {
            if (id.includes('node_modules/debug')) {
              return 'vendor-debug';
            }

            // Split i18n json resources by namespace (ns), not by locale.
            // Example: ".../resources/locales/zh-CN/common.json?import" -> "locales-common"
            const normalizedId = id.replaceAll('\\', '/').split('?')[0];
            const match = normalizedId.match(/\/locales\/[^/]+\/([^/]+)\.json$/);

            if (match?.[1]) return `locales-${match[1]}`;
          },
        },
      },
      sourcemap: isDev ? 'inline' : false,
    },
    define: {
      'process.env.UPDATE_CHANNEL': JSON.stringify(process.env.UPDATE_CHANNEL),
      'process.env.UPDATE_SERVER_URL': JSON.stringify(process.env.UPDATE_SERVER_URL),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/main'),
        '~common': resolve(__dirname, 'src/common'),
      },
    },
  },
  preload: {
    build: {
      minify: !isDev,
      outDir: 'dist/preload',
      sourcemap: isDev ? 'inline' : false,
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/main'),
        '~common': resolve(__dirname, 'src/common'),
      },
    },
  },
  renderer: {
    root: __dirname,
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    define: sharedRendererDefine({ isMobile: false, isElectron: true }),
    plugins: [
      ...sharedRendererPlugins({ platform: 'desktop', tsconfigRoot: ROOT_DIR }),
      react({ jsxImportSource: '@emotion/react' }),
    ],
    resolve: {
      alias: {},
    },
  },
});
