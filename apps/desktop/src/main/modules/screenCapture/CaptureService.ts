import type { CaptureRectParams } from '@lobechat/electron-client-ipc';
import { Monitor } from 'node-screenshots';

import { createLogger } from '@/utils/logger';

import { findWindowById } from './WindowSourceService';

const logger = createLogger('screenCapture:CaptureService');

/**
 * Capture a specific window by its native window id.
 */
export async function captureWindow(windowId: number): Promise<Buffer | null> {
  try {
    const win = findWindowById(windowId);
    if (!win) {
      logger.warn(`Window ${windowId} not found`);
      return null;
    }
    const image = await win.captureImage();
    const pngBuffer = Buffer.from(await image.toPng());
    return pngBuffer;
  } catch (error) {
    logger.error('Failed to capture window:', error);
    return null;
  }
}

/**
 * Capture a rect region from the monitor that contains the rect.
 * `absoluteRect` is in absolute DIP coordinates.
 */
export async function captureRect(
  absoluteRect: CaptureRectParams,
  scaleFactor: number,
): Promise<Buffer | null> {
  try {
    const centerX = Math.round((absoluteRect.x + absoluteRect.width / 2) * scaleFactor);
    const centerY = Math.round((absoluteRect.y + absoluteRect.height / 2) * scaleFactor);
    const monitor = Monitor.fromPoint(centerX, centerY);

    if (!monitor) {
      logger.warn(`No monitor found at point (${centerX}, ${centerY})`);
      return null;
    }

    const image = await monitor.captureImage();

    const physX = Math.round(absoluteRect.x * scaleFactor) - monitor.x();
    const physY = Math.round(absoluteRect.y * scaleFactor) - monitor.y();
    const physW = Math.round(absoluteRect.width * scaleFactor);
    const physH = Math.round(absoluteRect.height * scaleFactor);

    const cropX = Math.max(0, physX);
    const cropY = Math.max(0, physY);
    const cropW = Math.min(physW, image.width - cropX);
    const cropH = Math.min(physH, image.height - cropY);

    if (cropW <= 0 || cropH <= 0) {
      logger.warn(`Crop rect out of monitor bounds: ${cropX},${cropY} ${cropW}x${cropH}`);
      return null;
    }

    const cropped = await image.crop(cropX, cropY, cropW, cropH);
    const pngBuffer = Buffer.from(await cropped.toPng());
    return pngBuffer;
  } catch (error) {
    logger.error('Failed to capture rect:', error);
    return null;
  }
}
