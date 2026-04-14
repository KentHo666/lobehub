import type {
  CapturePreviewResult,
  CaptureRectParams,
  ScreenCaptureAgentOption,
  ScreenCaptureModelOption,
  ScreenCaptureOverlayTheme,
  ScreenCaptureSession,
  ScreenCaptureSubmitParams,
} from '@lobechat/electron-client-ipc';
import { BrowserWindow, screen } from 'electron';

import { preloadDir } from '@/const/dir';
import { isMac } from '@/const/env';
import type { App } from '@/core/App';
import { createLogger } from '@/utils/logger';

import { captureRect, captureWindow } from './CaptureService';
import { enumerateWindows } from './WindowSourceService';

const logger = createLogger('screenCapture:ScreenCaptureManager');

const HIDE_SETTLE_MS = 40;

export interface OverlaySnapshotPayload {
  agents?: ScreenCaptureAgentOption[];
  defaultAgentId?: string;
  defaultModelId?: string;
  defaultProvider?: string;
  models?: ScreenCaptureModelOption[];
  theme?: ScreenCaptureOverlayTheme;
}

export class ScreenCaptureManager {
  private overlayWindow: BrowserWindow | null = null;
  private session: ScreenCaptureSession | null = null;
  /**
   * Most recent agent/model snapshot published by the main renderer via
   * `screenCapture.publishOverlaySnapshot`. Populated asynchronously; the
   * overlay still opens with an empty selector list if the renderer has not
   * pushed yet.
   */
  private snapshot: OverlaySnapshotPayload = {};

  constructor(private readonly app: App) {}

  publishOverlaySnapshot(payload: OverlaySnapshotPayload): void {
    this.snapshot = payload;
    // If a session is already on screen, push the updated lists so the user
    // sees the current agents without reopening the overlay.
    if (this.session) {
      this.session = { ...this.session, ...this.snapshot };
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('screenCaptureSession', this.session);
      }
    }
  }

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

    const windows = await enumerateWindows(bounds);

    this.session = {
      displayBounds: bounds,
      scaleFactor,
      windows,
      ...this.snapshot,
    };

    await this.createOverlayWindow(bounds);
  }

  async handlePreviewWindow(windowId: number): Promise<CapturePreviewResult> {
    if (!this.session) {
      return { error: 'no active session', success: false };
    }

    const winInfo = this.session.windows.find((w) => w.windowId === windowId);
    if (!winInfo) {
      return { error: `window ${windowId} not found`, success: false };
    }

    logger.info(`Previewing window ${windowId} (${winInfo.appName})`);
    const pngBuffer = await this.withOverlayHidden(() => captureWindow(windowId));
    if (!pngBuffer) {
      return { error: 'capture failed', success: false };
    }

    return {
      dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      rect: {
        height: winInfo.overlayBounds.height,
        width: winInfo.overlayBounds.width,
        x: winInfo.overlayBounds.x,
        y: winInfo.overlayBounds.y,
      },
      success: true,
    };
  }

  /**
   * Preview a rect from the overlay. `params` is in overlay-local DIP
   * (relative to the current display); main translates to absolute before
   * handing to the capture pipeline.
   */
  async handlePreviewRect(params: CaptureRectParams): Promise<CapturePreviewResult> {
    if (!this.session) {
      return { error: 'no active session', success: false };
    }

    const { displayBounds, scaleFactor } = this.session;
    const absolute = {
      height: params.height,
      width: params.width,
      x: params.x + displayBounds.x,
      y: params.y + displayBounds.y,
    };

    logger.info(`Previewing rect (${params.x},${params.y} ${params.width}x${params.height})`);
    const pngBuffer = await this.withOverlayHidden(() =>
      captureRect(absolute, scaleFactor, displayBounds),
    );
    if (!pngBuffer) {
      return { error: 'capture failed', success: false };
    }

    return {
      dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      rect: params,
      success: true,
    };
  }

  async handleSubmit(params: ScreenCaptureSubmitParams): Promise<void> {
    logger.info(
      `Submit capture — promptLen=${params.prompt.length} size=${params.rect.width}x${params.rect.height} agentId=${params.agentId ?? '-'} modelId=${params.modelId ?? '-'}`,
    );

    // Close the overlay first so focus transfers cleanly to the main window.
    this.close();

    try {
      this.app.browserManager.showMainWindow();
    } catch (error) {
      logger.error('Failed to show main window on submit:', error);
    }

    this.app.browserManager.broadcastToAllWindows('overlayDispatchMessage', params);
  }

  close(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy();
    }
    this.overlayWindow = null;
    this.session = null;
    logger.info('Capture session closed');
  }

  /**
   * Fade overlay out via opacity so the capture pipeline sees clean pixels
   * underneath, then restore opacity. Keeping the window alive (as opposed to
   * hide/show) avoids focus/z-order glitches.
   */
  private async withOverlayHidden<T>(task: () => Promise<T>): Promise<T> {
    const win = this.overlayWindow;
    if (!win || win.isDestroyed()) {
      return task();
    }

    win.setOpacity(0);
    await delay(HIDE_SETTLE_MS);
    try {
      return await task();
    } finally {
      if (!win.isDestroyed()) {
        win.setOpacity(1);
      }
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
    win.setVisibleOnAllWorkspaces(true, {
      ...(isMac ? { skipTransformProcessType: true } : {}),
      visibleOnFullScreen: true,
    });

    if (isMac) {
      win.setHiddenInMissionControl(true);
    }

    this.overlayWindow = win;

    win.webContents.on('did-fail-load', (_event, code, description) => {
      logger.error(`Overlay did-fail-load code=${code} description=${description}`);
    });

    const url = await this.app.buildRendererUrl('/overlay');
    logger.info(`Loading overlay URL: ${url}`);

    win.webContents.once('did-finish-load', () => {
      logger.info('Overlay did-finish-load');
      if (this.session && !win.isDestroyed()) {
        logger.info(`Sending overlay session with ${this.session.windows.length} windows`);
        win.webContents.send('screenCaptureSession', this.session);
      }
    });

    await win.loadURL(url);

    win.show();
    win.focus();
    win.moveTop();

    logger.info('Overlay window created and shown');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
