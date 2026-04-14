import { MACOS_DOUBLE_OPTION_SHORTCUT } from '@/core/ui/MacOSDoubleOptionMonitor';

/**
 * Shortcut action type enum
 */
export const ShortcutActionEnum = {
  quickComposer: 'quickComposer',
  openSettings: 'openSettings',
  showApp: 'showApp',
} as const;

export type ShortcutActionType = (typeof ShortcutActionEnum)[keyof typeof ShortcutActionEnum];

/**
 * Default shortcut configuration
 */
export const DEFAULT_SHORTCUTS_CONFIG: Record<ShortcutActionType, string> = {
  [ShortcutActionEnum.quickComposer]:
    process.platform === 'darwin' ? MACOS_DOUBLE_OPTION_SHORTCUT : '',
  [ShortcutActionEnum.showApp]: 'Control+E',
  [ShortcutActionEnum.openSettings]: 'CommandOrControl+,',
};
