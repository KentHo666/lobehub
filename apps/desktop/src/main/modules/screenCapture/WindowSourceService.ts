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
  scaleFactor: number,
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

  // node-screenshots returns physical pixel coords; convert displayBounds to physical for intersection
  const physicalDisplayBounds: DisplayBounds = {
    height: displayBounds.height * scaleFactor,
    width: displayBounds.width * scaleFactor,
    x: displayBounds.x * scaleFactor,
    y: displayBounds.y * scaleFactor,
  };

  const allWindows = Window.all();
  const results: ScreenCaptureWindowInfo[] = [];

  for (const win of allWindows) {
    const appName = win.appName();

    if (SYSTEM_APP_BLACKLIST.has(appName)) continue;
    if (appName === selfName) continue;
    if (win.isMinimized()) continue;

    const physWidth = win.width();
    const physHeight = win.height();
    if (physWidth < MIN_WIDTH || physHeight < MIN_HEIGHT) continue;

    const physBounds = { height: physHeight, width: physWidth, x: win.x(), y: win.y() };
    if (!intersects(physBounds, physicalDisplayBounds)) continue;

    if (visiblePids && !visiblePids.has(win.pid())) continue;

    // Convert physical pixel bounds to DIP for the renderer
    results.push({
      appName,
      bounds: {
        height: Math.round(physHeight / scaleFactor),
        width: Math.round(physWidth / scaleFactor),
        x: Math.round(win.x() / scaleFactor),
        y: Math.round(win.y() / scaleFactor),
      },
      title: win.title(),
      windowId: win.id(),
    });
  }

  logger.info(`Enumerated ${results.length} windows for display`);
  return results;
}

export function findWindowById(windowId: number): Window | undefined {
  return Window.all().find((w) => w.id() === windowId);
}
