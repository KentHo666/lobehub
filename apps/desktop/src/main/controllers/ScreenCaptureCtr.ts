import type { CaptureRectParams } from '@lobechat/electron-client-ipc';

import { createLogger } from '@/utils/logger';

import { ControllerModule, IpcMethod } from './index';

const logger = createLogger('controllers:ScreenCaptureCtr');

export default class ScreenCaptureCtr extends ControllerModule {
  static override readonly groupName = 'screenCapture';

  @IpcMethod()
  async captureWindow(windowId: number): Promise<{ success: boolean }> {
    logger.debug(`captureWindow request: ${windowId}`);
    const success = await this.app.screenCaptureManager.handleCaptureWindow(windowId);
    return { success };
  }

  @IpcMethod()
  async captureRect(params: CaptureRectParams): Promise<{ success: boolean }> {
    logger.debug(`captureRect request: ${JSON.stringify(params)}`);
    const success = await this.app.screenCaptureManager.handleCaptureRect(params);
    return { success };
  }

  @IpcMethod()
  async close(): Promise<void> {
    logger.debug('close overlay request');
    this.app.screenCaptureManager.close();
  }
}
