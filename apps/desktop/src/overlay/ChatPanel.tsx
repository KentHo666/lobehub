import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { RefreshCwIcon, SendHorizontalIcon, XIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { cn } from './cn';
import { OVERLAY_COPY, OVERLAY_LAYOUT, OVERLAY_SHORTCUTS } from './constants';
import * as styles from './chatPanel.css.ts';
import {
  computeDockPosition,
  connectorPoint,
  type DockResult,
  type Rect,
} from './useDockPosition';

export interface ChatPanelSelection {
  dataUrl: string;
  label: string;
  rect: Rect;
}

export interface ChatPanelProps {
  onRetake: () => void;
  onSubmit: (prompt: string, selection: ChatPanelSelection) => void;
  selection: ChatPanelSelection | null;
  viewportHeight: number;
  viewportWidth: number;
}

const formatBytes = (rect: Rect): string =>
  `${Math.round(rect.width)} × ${Math.round(rect.height)} · ${OVERLAY_COPY.selectionFormatLabel}`;

const ChatPanel = memo<ChatPanelProps>(
  ({ selection, viewportWidth, viewportHeight, onSubmit, onRetake }) => {
    const [prompt, setPrompt] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const selected = !!selection;

    const initialPlacement = useMemo(
      () => ({
        left: Math.round((viewportWidth - OVERLAY_LAYOUT.panelWidthInitial) / 2),
        top: Math.round(
          viewportHeight - OVERLAY_LAYOUT.panelHeightEstimate - OVERLAY_LAYOUT.panelBottomGap,
        ),
        width: OVERLAY_LAYOUT.panelWidthInitial,
      }),
      [viewportWidth, viewportHeight],
    );

    const dock: DockResult | null = useMemo(() => {
      if (!selection) return null;
      return computeDockPosition({
        gap: OVERLAY_LAYOUT.dockGap,
        panelHeight: OVERLAY_LAYOUT.panelHeightEstimate,
        panelWidth: OVERLAY_LAYOUT.panelWidthDocked,
        rect: selection.rect,
        viewportHeight,
        viewportWidth,
      });
    }, [selection, viewportWidth, viewportHeight]);

    const placement = dock
      ? { left: dock.left, top: dock.top, width: OVERLAY_LAYOUT.panelWidthDocked }
      : initialPlacement;

    const connector = useMemo(() => {
      if (!selection || !dock || dock.side === 'edge') return null;
      const pt = connectorPoint(selection.rect, dock.side);
      return {
        left: pt.x - OVERLAY_LAYOUT.connectorSize / 2,
        top: pt.y - OVERLAY_LAYOUT.connectorSize / 2,
      };
    }, [selection, dock]);

    // Focus textarea when selection arrives
    useLayoutEffect(() => {
      if (selected && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [selected]);

    // Clear prompt when selection cleared
    useEffect(() => {
      if (!selected) setPrompt('');
    }, [selected]);

    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (selection && prompt.trim()) {
            onSubmit(prompt.trim(), selection);
          }
        }
      },
      [selection, prompt, onSubmit],
    );

    const canSend = selected && prompt.trim().length > 0;

    return (
      <>
        {connector && (
          <div
            className={cn(styles.connector, selected && styles.connectorVisible)}
            style={{ left: connector.left, top: connector.top }}
          />
        )}
        <div
          className={cn(styles.panel, !selected && styles.initialEnter)}
          style={{
            cursor: 'default',
            left: placement.left,
            top: placement.top,
            width: placement.width,
          }}
          onMouseDown={(e: ReactMouseEvent<HTMLDivElement>) => e.stopPropagation()}
          onMouseMove={(e: ReactMouseEvent<HTMLDivElement>) => e.stopPropagation()}
          onMouseUp={(e: ReactMouseEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          {selection && (
            <div className={styles.selectionSummary}>
              <div
                aria-label="screenshot thumbnail"
                className={styles.thumb}
                style={{ backgroundImage: `url(${selection.dataUrl})` }}
              />
              <div className={styles.summaryText}>
                <div className={styles.summaryTitle}>
                  {OVERLAY_COPY.screenshotLabel} · {selection.label}
                </div>
                <div className={styles.summaryMeta}>{formatBytes(selection.rect)}</div>
              </div>
              <div className={styles.summaryActions}>
                <button
                  className={styles.secondaryBtn}
                  title={OVERLAY_COPY.retakeTitle}
                  type="button"
                  onClick={onRetake}
                >
                  <RefreshCwIcon size={14} strokeWidth={2} />
                  <span>{OVERLAY_COPY.retakeLabel}</span>
                </button>
                <button
                  aria-label={OVERLAY_COPY.removeSelectionLabel}
                  className={styles.iconBtn}
                  type="button"
                  onClick={onRetake}
                >
                  <XIcon size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}

          <div className={styles.inputRow}>
            <textarea
              className={styles.textarea}
              ref={textareaRef}
              rows={2}
              spellCheck={false}
              value={prompt}
              placeholder={
                selected ? OVERLAY_COPY.selectedPlaceholder : OVERLAY_COPY.idlePlaceholder
              }
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              aria-label={OVERLAY_COPY.sendAriaLabel}
              className={styles.sendBtn}
              disabled={!canSend}
              type="button"
              onClick={() => selection && onSubmit(prompt.trim(), selection)}
            >
              <SendHorizontalIcon size={16} strokeWidth={2.1} />
            </button>
          </div>

          <div className={styles.footer}>
            <span>
              <span className={styles.kbd}>{OVERLAY_SHORTCUTS.send}</span>
              {OVERLAY_COPY.sendHint}
            </span>
            <span>
              <span className={styles.kbd}>{OVERLAY_SHORTCUTS.newline}</span>
              {OVERLAY_COPY.newlineHint}
            </span>
            <span>
              <span className={styles.kbd}>{OVERLAY_SHORTCUTS.retake}</span>
              {OVERLAY_COPY.retakeLabel}
            </span>
            <span>
              <span className={styles.kbd}>{OVERLAY_SHORTCUTS.close}</span>
              {selected ? OVERLAY_COPY.clearSelectionLabel : OVERLAY_COPY.closeLabel}
            </span>
          </div>
        </div>
      </>
    );
  },
);

ChatPanel.displayName = 'ChatPanel';

export default ChatPanel;
