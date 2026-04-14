import type { ScreenCaptureWindowInfo } from '@lobechat/electron-client-ipc';
import { app } from 'electron';
import { Window } from 'node-screenshots';

import { createLogger } from '@/utils/logger';

const logger = createLogger('screenCapture:WindowSourceService');

const MIN_WIDTH = 80;
const MIN_HEIGHT = 60;

const SYSTEM_APP_BLACKLIST = new Set([
  'Dock',
  'Window Server',
  'WindowServer',
  'Control Centre',
  'Control Center',
  'SystemUIServer',
  'Notification Centre',
  'Notification Center',
]);

interface DisplayBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

function intersects(a: DisplayBounds, b: DisplayBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export async function enumerateWindows(
  displayBounds: DisplayBounds,
): Promise<ScreenCaptureWindowInfo[]> {
  const selfName = app.getName();

  // get-windows for whitelist filtering
  let visiblePids: Set<number> | undefined;
  try {
    const { openWindows } = await import('get-windows');
    const visible = await openWindows({
      accessibilityPermission: false,
      screenRecordingPermission: false,
    });
    visiblePids = new Set(visible.map((w) => w.owner.processId));
  } catch (error) {
    logger.warn('get-windows unavailable, skipping whitelist filter:', error);
  }

  const visibleWindows = Window.all()
    .filter((win) => {
      const appName = win.appName();

      if (SYSTEM_APP_BLACKLIST.has(appName)) return false;
      if (appName === selfName) return false;
      if (win.isMinimized()) return false;

      const physWidth = win.width();
      const physHeight = win.height();
      if (physWidth < MIN_WIDTH || physHeight < MIN_HEIGHT) return false;

      const bounds = { height: physHeight, width: physWidth, x: win.x(), y: win.y() };
      if (!intersects(bounds, displayBounds)) return false;

      if (visiblePids && !visiblePids.has(win.pid())) return false;

      return true;
    })
    .sort((left, right) => right.z() - left.z());

  const results = visibleWindows.map((win, index) => {
    const bounds = {
      height: win.height(),
      width: win.width(),
      x: win.x(),
      y: win.y(),
    };

    return {
      appName: win.appName(),
      bounds,
      order: index,
      overlayBounds: {
        height: bounds.height,
        width: bounds.width,
        x: bounds.x - displayBounds.x,
        y: bounds.y - displayBounds.y,
      },
      title: win.title(),
      windowId: win.id(),
    };
  });

  logger.info(`Enumerated ${results.length} windows for display`);
  return results;
}

export function findWindowById(windowId: number): Window | undefined {
  return Window.all().find((w) => w.id() === windowId);
}
