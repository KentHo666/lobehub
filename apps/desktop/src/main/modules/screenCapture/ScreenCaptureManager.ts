import type { CaptureRectParams, ScreenCaptureSession } from '@lobechat/electron-client-ipc';
import { BrowserWindow, screen } from 'electron';

import { preloadDir } from '@/const/dir';
import { isMac } from '@/const/env';
import type { App } from '@/core/App';
import { createLogger } from '@/utils/logger';

import { captureRect, captureWindow } from './CaptureService';
import { enumerateWindows } from './WindowSourceService';

const logger = createLogger('screenCapture:ScreenCaptureManager');

export class ScreenCaptureManager {
  private overlayWindow: BrowserWindow | null = null;
  private session: ScreenCaptureSession | null = null;

  constructor(private readonly app: App) {}

  get isActive(): boolean {
    return this.overlayWindow !== null && !this.overlayWindow.isDestroyed();
  }

  async startSession(): Promise<void> {
    if (this.isActive) {
      logger.warn('Capture session already active');
      this.close();
    }

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { bounds, scaleFactor } = display;

    logger.info(
      `Starting capture session on display ${display.id} (${bounds.width}x${bounds.height} @${scaleFactor}x)`,
    );

    const windows = await enumerateWindows(bounds, scaleFactor);

    this.session = {
      displayBounds: bounds,
      scaleFactor,
      windows,
    };

    await this.createOverlayWindow(bounds);
  }

  async handleCaptureWindow(windowId: number): Promise<boolean> {
    logger.info(`Capturing window ${windowId}`);
    this.hideOverlay();

    // Brief delay to let the overlay disappear
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await captureWindow(windowId);
    this.close();
    return result;
  }

  async handleCaptureRect(params: CaptureRectParams): Promise<boolean> {
    if (!this.session) return false;

    logger.info(`Capturing rect (${params.x},${params.y} ${params.width}x${params.height})`);
    this.hideOverlay();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = await captureRect(params, this.session.scaleFactor);
    this.close();
    return result;
  }

  close(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy();
    }
    this.overlayWindow = null;
    this.session = null;
    logger.info('Capture session closed');
  }

  private hideOverlay(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
  }

  private async createOverlayWindow(bounds: Electron.Rectangle): Promise<void> {
    const win = new BrowserWindow({
      ...(isMac ? { type: 'panel' } : {}),
      enableLargerThanScreen: true,
      focusable: true,
      frame: false,
      fullscreenable: false,
      hasShadow: false,
      height: bounds.height,
      resizable: false,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        preload: `${preloadDir}/index.js`,
        sandbox: false,
      },
      width: bounds.width,
      x: bounds.x,
      y: bounds.y,
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    if (isMac) {
      win.setHiddenInMissionControl(true);
    }

    this.overlayWindow = win;

    // Load the overlay MPA entry (separate from main SPA)
    const url = await this.app.buildRendererUrl('/overlay');
    await win.loadURL(url);

    // Send session data once renderer is ready
    win.webContents.on('did-finish-load', () => {
      if (this.session && !win.isDestroyed()) {
        win.webContents.send('screenCaptureSession', this.session);
      }
    });

    win.show();

    logger.info('Overlay window created and shown');
  }
}
