import type { ScreenCaptureSession, ScreenCaptureSubmitParams } from '../types/screenCapture';

/**
 * Payload broadcast to the main renderer when the overlay submits a screenshot
 * with a prompt. The main renderer is responsible for focusing the intended
 * agent session and sending the message through the chat store.
 */
export interface OverlayDispatchMessagePayload extends ScreenCaptureSubmitParams {}

export interface ScreenCaptureBroadcastEvents {
  overlayDispatchMessage: (payload: OverlayDispatchMessagePayload) => void;
  screenCaptureSession: (data: ScreenCaptureSession) => void;
}
