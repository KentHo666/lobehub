import { globalStyle, keyframes, style } from '@vanilla-extract/css';

import { OVERLAY_LAYOUT } from './constants';

const theme = {
  color: {
    divider: 'rgba(15, 23, 42, 0.08)',
    footerBackground: 'rgba(248, 250, 252, 0.92)',
    icon: '#5b6578',
    iconHover: '#0f172a',
    panelBackground: 'rgba(255, 255, 255, 0.96)',
    panelButton: 'rgba(15, 23, 42, 0.04)',
    panelButtonHover: 'rgba(15, 23, 42, 0.08)',
    panelMuted: '#637087',
    panelPrimary: '#2563eb',
    panelPrimaryHover: '#1d4ed8',
    panelPrimaryText: '#ffffff',
    panelSubtle: '#8a95a7',
    panelText: '#0f172a',
    thumbBackground: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)',
  },
  font: {
    mono: "'SF Mono', ui-monospace, Menlo, monospace",
    system:
      "'SF Pro Display', 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  motion: {
    enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
    spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
  },
  radius: {
    button: '10px',
    kbd: '6px',
    panel: '16px',
    thumb: '10px',
  },
  shadow: {
    connector: '0 0 0 4px rgba(37, 99, 235, 0.16), 0 0 18px rgba(37, 99, 235, 0.36)',
    panel: '0 20px 44px rgba(2, 8, 23, 0.26), 0 2px 10px rgba(2, 8, 23, 0.08)',
  },
} as const;

export const panel = style({
  background: theme.color.panelBackground,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: `1px solid ${theme.color.divider}`,
  borderRadius: theme.radius.panel,
  boxShadow: theme.shadow.panel,
  color: theme.color.panelText,
  fontFamily: theme.font.system,
  overflow: 'hidden',
  pointerEvents: 'auto',
  position: 'fixed',
  transition: `left 420ms ${theme.motion.spring}, top 420ms ${theme.motion.spring}, width 320ms ${theme.motion.enter}`,
  willChange: 'left, top, width',
  zIndex: 20,
});

export const selectionSummary = style({
  alignItems: 'center',
  borderBottom: `1px solid ${theme.color.divider}`,
  display: 'flex',
  gap: 12,
  padding: '12px 14px',
});

export const thumb = style({
  background: theme.color.thumbBackground,
  backgroundPosition: 'center',
  backgroundSize: 'cover',
  border: `1px solid ${theme.color.divider}`,
  borderRadius: theme.radius.thumb,
  flexShrink: 0,
  height: 48,
  overflow: 'hidden',
  position: 'relative',
  width: 72,
});

export const summaryText = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  gap: 4,
  minWidth: 0,
});

export const summaryTitle = style({
  color: theme.color.panelText,
  fontSize: 12,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const summaryMeta = style({
  color: theme.color.panelSubtle,
  fontFamily: theme.font.mono,
  fontSize: 11,
  letterSpacing: '0.01em',
});

export const summaryActions = style({
  alignItems: 'center',
  display: 'flex',
  gap: 8,
});

const buttonBase = {
  alignItems: 'center',
  background: theme.color.panelButton,
  border: `1px solid ${theme.color.divider}`,
  borderRadius: theme.radius.button,
  color: theme.color.icon,
  cursor: 'pointer',
  display: 'inline-flex',
  justifyContent: 'center',
  transition: `background 120ms ease, color 120ms ease, transform 140ms ${theme.motion.spring}` as const,
  selectors: {
    '&:hover': {
      background: theme.color.panelButtonHover,
      color: theme.color.iconHover,
    },
    '&:active': { transform: 'scale(0.97)' },
  },
} as const;

export const iconBtn = style({
  ...buttonBase,
  height: 32,
  width: 32,
});

export const secondaryBtn = style({
  ...buttonBase,
  fontSize: 12,
  fontWeight: 550,
  gap: 6,
  height: 32,
  padding: '0 10px',
});

export const inputRow = style({
  alignItems: 'flex-end',
  display: 'flex',
  gap: 12,
  padding: '14px 14px 12px',
});

export const textarea = style({
  background: 'transparent',
  border: 'none',
  color: theme.color.panelText,
  display: 'block',
  fontFamily: 'inherit',
  flex: 1,
  fontSize: 14,
  lineHeight: 1.5,
  maxHeight: 160,
  minHeight: 48,
  outline: 'none',
  padding: 0,
  resize: 'none',
  selectors: {
    '&::placeholder': { color: theme.color.panelSubtle },
  },
});

export const sendBtn = style({
  alignItems: 'center',
  alignSelf: 'stretch',
  background: theme.color.panelPrimary,
  border: 'none',
  borderRadius: theme.radius.button,
  color: theme.color.panelPrimaryText,
  cursor: 'pointer',
  display: 'inline-flex',
  height: 40,
  justifyContent: 'center',
  transition: `background 120ms ease, transform 140ms ${theme.motion.spring}`,
  width: 40,
  selectors: {
    '&:hover': { background: theme.color.panelPrimaryHover, transform: 'translateY(-1px)' },
    '&:active': { transform: 'scale(0.94)' },
    '&:disabled': { cursor: 'not-allowed', opacity: 0.5, transform: 'none' },
  },
});

export const footer = style({
  alignItems: 'center',
  background: theme.color.footerBackground,
  borderTop: `1px solid ${theme.color.divider}`,
  color: theme.color.panelMuted,
  display: 'flex',
  fontSize: 11,
  gap: 16,
  justifyContent: 'center',
  padding: '8px 14px 10px',
});

export const kbd = style({
  background: '#fff',
  border: `1px solid ${theme.color.divider}`,
  borderBottomWidth: 2,
  borderRadius: theme.radius.kbd,
  color: theme.color.panelMuted,
  display: 'inline-flex',
  fontFamily: theme.font.mono,
  fontSize: 10,
  fontWeight: 600,
  height: 16,
  letterSpacing: '0.03em',
  marginRight: 4,
  padding: '0 5px',
});

export const connector = style({
  background: theme.color.panelPrimary,
  borderRadius: '50%',
  boxShadow: theme.shadow.connector,
  height: OVERLAY_LAYOUT.connectorSize,
  opacity: 0,
  pointerEvents: 'none',
  position: 'fixed',
  transition:
    `opacity 200ms ${theme.motion.enter} 140ms, left 320ms ${theme.motion.spring}, top 320ms ${theme.motion.spring}`,
  width: OVERLAY_LAYOUT.connectorSize,
  zIndex: 15,
});

export const connectorVisible = style({
  opacity: 1,
});

const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translate(-50%, 8px)' },
  to: { opacity: 1, transform: 'translate(-50%, 0)' },
});

export const initialEnter = style({
  animation: `${fadeIn} 280ms ${theme.motion.enter}`,
});

// highlight overlay text when dragging inside textarea
globalStyle(`.${textarea}::selection`, {
  background: 'rgba(37, 99, 235, 0.18)',
});
