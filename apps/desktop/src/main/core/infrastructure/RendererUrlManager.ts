import { pathExistsSync } from 'fs-extra';
import { extname, join } from 'node:path';

import { rendererDir } from '@/const/dir';
import { isDev } from '@/const/env';
import { getDesktopEnv } from '@/env';
import { createLogger } from '@/utils/logger';

import { RendererProtocolManager } from './RendererProtocolManager';

const logger = createLogger('core:RendererUrlManager');
const devDefaultRendererUrl = 'http://localhost:3015';

export class RendererUrlManager {
  private readonly rendererProtocolManager: RendererProtocolManager;
  private readonly rendererStaticOverride = getDesktopEnv().DESKTOP_RENDERER_STATIC;
  private rendererLoadedUrl: string;

  constructor() {
    this.rendererProtocolManager = new RendererProtocolManager({
      rendererDir,
      resolveRendererFilePath: this.resolveRendererFilePath,
    });

    this.rendererLoadedUrl = this.rendererProtocolManager.getRendererUrl();
  }

  get protocolScheme() {
    return this.rendererProtocolManager.protocolScheme;
  }

  /**
   * Configure renderer loading strategy for dev/prod
   */
  configureRendererLoader() {
    if (isDev && !this.rendererStaticOverride) {
      this.rendererLoadedUrl = devDefaultRendererUrl;
      this.setupDevRenderer();
      return;
    }

    if (isDev && this.rendererStaticOverride) {
      logger.warn('Dev mode: DESKTOP_RENDERER_STATIC enabled, using static renderer handler');
    }

    this.setupProdRenderer();
  }

  /**
   * Build renderer URL for dev/prod.
   */
  buildRendererUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.rendererLoadedUrl}${cleanPath}`;
  }

  /**
   * Resolve renderer file path in production.
   * Static assets map directly; all routes fall back to index.html (SPA).
   */
  resolveRendererFilePath = async (url: URL): Promise<string | null> => {
    const pathname = url.pathname;

    // Static assets: direct file mapping
    if (pathname.startsWith('/assets/') || extname(pathname)) {
      const filePath = join(rendererDir, pathname);
      return pathExistsSync(filePath) ? filePath : null;
    }

    // All routes fallback to index.html (SPA)
    return join(rendererDir, 'index.html');
  };

  /**
   * Development: use Next dev server directly
   */
  private setupDevRenderer() {
    logger.info('Development mode: renderer served from Next dev server, no protocol hook');
  }

  /**
   * Production: serve static Next export assets
   */
  private setupProdRenderer() {
    this.rendererLoadedUrl = this.rendererProtocolManager.getRendererUrl();
    this.rendererProtocolManager.registerHandler();
  }
}
