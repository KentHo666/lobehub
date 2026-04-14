import type {
  CapturePreviewResult,
  CaptureRectParams,
  ScreenCaptureSubmitParams,
} from '@lobechat/electron-client-ipc';

import { createLogger } from '@/utils/logger';

import { ControllerModule, IpcMethod } from './index';

const logger = createLogger('controllers:ScreenCaptureCtr');

export default class ScreenCaptureCtr extends ControllerModule {
  static override readonly groupName = 'screenCapture';

  @IpcMethod()
  async previewWindow(windowId: number): Promise<CapturePreviewResult> {
    logger.debug(`previewWindow request: ${windowId}`);
    return this.app.screenCaptureManager.handlePreviewWindow(windowId);
  }

  @IpcMethod()
  async previewRect(params: CaptureRectParams): Promise<CapturePreviewResult> {
    logger.debug(`previewRect request: ${JSON.stringify(params)}`);
    return this.app.screenCaptureManager.handlePreviewRect(params);
  }

  @IpcMethod()
  async submit(params: ScreenCaptureSubmitParams): Promise<void> {
    logger.debug(`submit request: prompt-len=${params.prompt.length}`);
    await this.app.screenCaptureManager.handleSubmit(params);
  }

  @IpcMethod()
  async close(): Promise<void> {
    logger.debug('close overlay request');
    this.app.screenCaptureManager.close();
  }
}
