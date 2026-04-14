export const OVERLAY_COPY = {
  agentSelectLabel: 'Agent',
  agentSelectPlaceholder: 'Default agent',
  clearSelectionLabel: 'Clear selection',
  closeLabel: 'Close',
  customRegionLabel: 'Custom region',
  idlePlaceholder: 'Select a window or drag a region to start asking…',
  modelSelectLabel: 'Model',
  modelSelectPlaceholder: 'Default model',
  newlineHint: 'New line',
  removeSelectionLabel: 'Remove selection',
  screenshotLabel: 'Screenshot',
  selectedPlaceholder: 'Ask about this screenshot…',
  selectionFormatLabel: 'PNG',
  sendAriaLabel: 'Send',
  sendHint: 'Send',
} as const;

export const OVERLAY_SHORTCUTS = {
  close: 'Esc',
  newline: 'Shift + Enter',
  send: 'Enter',
} as const;

export const OVERLAY_LAYOUT = {
  clickToDragThreshold: 5,
  connectorSize: 8,
  dockGap: 12,
  labelClipLength: 60,
  minDragSize: 10,
  panelBottomGap: 32,
  panelHeightEstimate: 208,
  panelWidthDocked: 440,
  panelWidthInitial: 560,
  viewportMargin: 16,
  windowTagHorizontalInset: 12,
  windowTagMaxWidth: 420,
  windowTagTopOffset: 12,
} as const;
