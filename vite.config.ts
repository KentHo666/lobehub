import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const isMobile = process.env.MOBILE === 'true';

export default defineConfig({
  build: {
    outDir: isMobile ? 'dist/mobile' : 'dist/desktop',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  define: {
    __MOBILE__: JSON.stringify(isMobile),
    'process.env.NEXT_PUBLIC_IS_DESKTOP_APP': JSON.stringify('0'),
  },
  plugins: [
    tsconfigPaths(),
    react({ jsxImportSource: '@emotion/react' }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
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
