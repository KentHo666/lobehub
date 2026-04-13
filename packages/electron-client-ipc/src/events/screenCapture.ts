import type { ScreenCaptureSession } from '../types/screenCapture';

export interface ScreenCaptureBroadcastEvents {
  screenCaptureSession: (data: ScreenCaptureSession) => void;
}
