export interface ScreenCaptureWindowInfo {
  appName: string;
  bounds: { height: number; width: number; x: number; y: number };
  order: number;
  overlayBounds: { height: number; width: number; x: number; y: number };
  title: string;
  windowId: number;
}

export interface ScreenCaptureSession {
  displayBounds: { height: number; width: number; x: number; y: number };
  scaleFactor: number;
  windows: ScreenCaptureWindowInfo[];
}

/**
 * Rect in overlay-local DIP coordinates (relative to the current display).
 * Main-side translation to absolute coords is the caller's responsibility
 * where absolute geometry is required (see ScreenCaptureManager.handlePreviewRect).
 */
export interface CaptureRectParams {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CapturePreviewResult {
  dataUrl?: string;
  error?: string;
  /** Overlay-local DIP rect. */
  rect?: CaptureRectParams;
  success: boolean;
}

export interface ScreenCaptureSubmitParams {
  dataUrl: string;
  prompt: string;
  /** Overlay-local DIP rect bound to the preview dataUrl. */
  rect: CaptureRectParams;
}
