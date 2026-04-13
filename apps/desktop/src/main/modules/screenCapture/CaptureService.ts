import type { CaptureRectParams } from '@lobechat/electron-client-ipc';
import { clipboard, nativeImage } from 'electron';
import { Monitor } from 'node-screenshots';

import { createLogger } from '@/utils/logger';

import { findWindowById } from './WindowSourceService';

const logger = createLogger('screenCapture:CaptureService');

export async function captureWindow(windowId: number): Promise<boolean> {
  const win = findWindowById(windowId);
  if (!win) {
    logger.warn(`Window ${windowId} not found`);
    return false;
  }

  try {
    const image = await win.captureImage();
    const pngBuffer = await image.toPng();
    const ni = nativeImage.createFromBuffer(Buffer.from(pngBuffer));
    clipboard.writeImage(ni);
    logger.info(`Captured window ${windowId} to clipboard`);
    return true;
  } catch (error) {
    logger.error(`Failed to capture window ${windowId}:`, error);
    return false;
  }
}

export async function captureRect(
  params: CaptureRectParams,
  scaleFactor: number,
): Promise<boolean> {
  try {
    // Find the monitor that contains the rect center (physical pixels)
    const centerX = Math.round((params.x + params.width / 2) * scaleFactor);
    const centerY = Math.round((params.y + params.height / 2) * scaleFactor);
    const monitor = Monitor.fromPoint(centerX, centerY);

    if (!monitor) {
      logger.warn(`No monitor found at point (${centerX}, ${centerY})`);
      return false;
    }

    const fullImage = await monitor.captureImage();

    // Convert DIP rect to physical pixels relative to monitor origin
    const physX = Math.round(params.x * scaleFactor) - monitor.x();
    const physY = Math.round(params.y * scaleFactor) - monitor.y();
    const physW = Math.round(params.width * scaleFactor);
    const physH = Math.round(params.height * scaleFactor);

    const cropped = await fullImage.crop(
      Math.max(0, physX),
      Math.max(0, physY),
      Math.min(physW, fullImage.width - Math.max(0, physX)),
      Math.min(physH, fullImage.height - Math.max(0, physY)),
    );

    const pngBuffer = await cropped.toPng();
    const ni = nativeImage.createFromBuffer(Buffer.from(pngBuffer));
    clipboard.writeImage(ni);
    logger.info(
      `Captured rect (${params.x},${params.y} ${params.width}x${params.height}) to clipboard`,
    );
    return true;
  } catch (error) {
    logger.error('Failed to capture rect:', error);
    return false;
  }
}
