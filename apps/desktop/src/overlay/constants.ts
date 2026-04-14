export const OVERLAY_COPY = {
  clearSelectionLabel: 'Clear selection',
  closeLabel: 'Close',
  customRegionLabel: 'Custom region',
  idlePlaceholder: 'Select a window or drag a region to start asking…',
  newlineHint: 'New line',
  removeSelectionLabel: 'Remove selection',
  retakeLabel: 'Retake',
  retakeTitle: 'Retake selection (R)',
  screenshotLabel: 'Screenshot',
  selectedPlaceholder: 'Ask about this screenshot…',
  selectionFormatLabel: 'PNG',
  sendAriaLabel: 'Send',
  sendHint: 'Send',
} as const;

export const OVERLAY_SHORTCUTS = {
  close: 'Esc',
  newline: 'Shift + Enter',
  retake: 'R',
  send: 'Enter',
} as const;

export const OVERLAY_LAYOUT = {
  clickToDragThreshold: 5,
  connectorSize: 8,
  dockGap: 12,
  labelClipLength: 60,
  minDragSize: 10,
  panelBottomGap: 32,
  panelHeightEstimate: 212,
  panelWidthDocked: 420,
  panelWidthInitial: 540,
  viewportMargin: 16,
  windowTagHorizontalInset: 12,
  windowTagMaxWidth: 420,
  windowTagTopOffset: 12,
} as const;
