export interface ScreenCaptureWindowInfo {
  appName: string;
  bounds: { height: number; width: number; x: number; y: number };
  title: string;
  windowId: number;
}

export interface ScreenCaptureSession {
  displayBounds: { height: number; width: number; x: number; y: number };
  scaleFactor: number;
  windows: ScreenCaptureWindowInfo[];
}

export interface CaptureRectParams {
  height: number;
  width: number;
  x: number;
  y: number;
}
