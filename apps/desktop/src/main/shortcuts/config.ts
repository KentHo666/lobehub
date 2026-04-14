import { MACOS_DOUBLE_OPTION_SHORTCUT } from '@/core/ui/MacOSDoubleOptionMonitor';

/**
 * Shortcut action type enum
 */
export const ShortcutActionEnum = {
  openSettings: 'openSettings',
  /**
   * Legacy shortcut id retained for compatibility.
   * Actual behavior opens the mini toolbar.
   */
  showApp: 'showApp',
} as const;

export type ShortcutActionType = (typeof ShortcutActionEnum)[keyof typeof ShortcutActionEnum];

/**
 * Default shortcut configuration
 */
export const DEFAULT_SHORTCUTS_CONFIG: Record<ShortcutActionType, string> = {
  [ShortcutActionEnum.showApp]:
    process.platform === 'darwin' ? MACOS_DOUBLE_OPTION_SHORTCUT : 'Control+E',
  [ShortcutActionEnum.openSettings]: 'CommandOrControl+,',
};
