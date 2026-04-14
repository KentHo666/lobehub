import type {
  CapturePreviewResult,
  CaptureRectParams,
  ScreenCaptureSubmitParams,
} from '@lobechat/electron-client-ipc';

import type { OverlaySnapshotPayload } from '@/modules/screenCapture/ScreenCaptureManager';
import { createLogger } from '@/utils/logger';

import { ControllerModule, IpcMethod } from './index';

const logger = createLogger('controllers:ScreenCaptureCtr');

export default class ScreenCaptureCtr extends ControllerModule {
  static override readonly groupName = 'screenCapture';

  @IpcMethod()
  async traceOverlayEvent(payload: { data?: unknown; event: string }): Promise<void> {
    console.info('[screenCapture:overlay]', payload.event, payload.data ?? '');
  }

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

  /**
   * Renderer-driven snapshot of agents/models for the overlay selector. The
   * main renderer pushes this whenever its data layer (TRPC stores) reports
   * a change; main process only caches and forwards — it does not fetch.
   */
  @IpcMethod()
  async publishOverlaySnapshot(payload: OverlaySnapshotPayload): Promise<void> {
    logger.debug(
      `publishOverlaySnapshot — agents=${payload.agents?.length ?? 0} models=${payload.models?.length ?? 0}`,
    );
    this.app.screenCaptureManager.publishOverlaySnapshot(payload);
  }
}
