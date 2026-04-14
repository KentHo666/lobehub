export interface ScreenCaptureWindowInfo {
  appName: string;
  bounds: { height: number; width: number; x: number; y: number };
  order: number;
  overlayBounds: { height: number; width: number; x: number; y: number };
  title: string;
  windowId: number;
}

/**
 * Lightweight agent descriptor for the overlay selector.
 * Populated by the renderer data layer (TRPC), not the IPC service.
 */
export interface ScreenCaptureAgentOption {
  avatar?: string | null;
  backgroundColor?: string | null;
  id: string;
  title: string;
}

/**
 * Lightweight model descriptor for the overlay selector.
 * Populated by the renderer data layer (TRPC), not the IPC service.
 */
export interface ScreenCaptureModelOption {
  displayName?: string | null;
  id: string;
  provider: string;
}

export interface ScreenCaptureOverlayTheme {
  colorBgElevated: string;
  colorBorderSecondary: string;
  colorFill: string;
  colorFillQuaternary: string;
  colorFillSecondary: string;
  colorFillTertiary: string;
  colorPrimary: string;
  colorPrimaryActive: string;
  colorPrimaryHover: string;
  colorText: string;
  colorTextLightSolid: string;
  colorTextQuaternary: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  panelBorder: string;
  panelShadow: string;
}

export interface ScreenCaptureSession {
  /** Optional agent list; overlay may still render with empty list. */
  agents?: ScreenCaptureAgentOption[];
  defaultAgentId?: string;
  defaultModelId?: string;
  defaultProvider?: string;
  displayBounds: { height: number; width: number; x: number; y: number };
  /** Optional model list. */
  models?: ScreenCaptureModelOption[];
  scaleFactor: number;
  theme?: ScreenCaptureOverlayTheme;
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

export interface ScreenCaptureSubmitCapture {
  dataUrl: string;
  /** Overlay-local DIP rect bound to the preview dataUrl. */
  rect: CaptureRectParams;
}

export interface ScreenCaptureSubmitParams {
  agentId?: string;
  captures: ScreenCaptureSubmitCapture[];
  modelId?: string;
  prompt: string;
  provider?: string;
}
