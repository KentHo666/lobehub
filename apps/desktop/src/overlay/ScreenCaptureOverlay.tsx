import type {
  CapturePreviewResult,
  ScreenCaptureSession,
} from '@lobechat/electron-client-ipc';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import ChatPanel, { type ChatPanelSelection } from './ChatPanel';
import { OVERLAY_COPY, OVERLAY_LAYOUT } from './constants';
import * as styles from './overlay.css.ts';
import { useDragSelection } from './useDragSelection';
import { useWindowHighlight } from './useWindowHighlight';
import WindowTag from './WindowTag';

const clipLabel = (text: string, max = OVERLAY_LAYOUT.labelClipLength): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const ScreenCaptureOverlay = memo(() => {
  const [session, setSession] = useState<ScreenCaptureSession | null>(null);
  const [selection, setSelection] = useState<ChatPanelSelection | null>(null);
  const capturingRef = useRef(false);
  const pendingWindowRef = useRef<ScreenCaptureSession['windows'][number] | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onScreenCaptureSession?.((data) => {
      setSession(data);
    });

    if (!unsubscribe) {
      console.error('[overlay] screenCapture session bridge missing');
      return;
    }

    return () => {
      unsubscribe();
    };
  }, []);

  const windows = session?.windows ?? [];
  const { hoveredWindow, handleMouseMove: hitTest } = useWindowHighlight(windows);
  const { dragRect, isDragging, onMouseDown, onMouseMove, onMouseUp, reset } = useDragSelection();

  const viewportWidth = session?.displayBounds.width ?? window.innerWidth;
  const viewportHeight = session?.displayBounds.height ?? window.innerHeight;

  const handleClose = useCallback(() => {
    window.electronAPI?.invoke?.('screenCapture.close');
  }, []);

  const handleRetake = useCallback(() => {
    setSelection(null);
    reset();
  }, [reset]);

  const handleSubmit = useCallback(
    (prompt: string, sel: ChatPanelSelection) => {
      window.electronAPI?.invoke?.('screenCapture.submit', {
        dataUrl: sel.dataUrl,
        prompt,
        rect: sel.rect,
      });
    },
    [],
  );

  // Two-stage Esc: clear selection first, then close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selection) {
          handleRetake();
        } else {
          handleClose();
        }
        return;
      }
      // Retake hotkey when selected
      if ((e.key === 'r' || e.key === 'R') && selection) {
        const target = e.target as HTMLElement | null;
        // Ignore when typing in the textarea
        if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') return;
        handleRetake();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, handleClose, handleRetake]);

  const previewWindow = useCallback(
    async (win: ScreenCaptureSession['windows'][number]) => {
      if (capturingRef.current) return;
      capturingRef.current = true;
      try {
        const result = (await window.electronAPI?.invoke?.(
          'screenCapture.previewWindow',
          win.windowId,
        )) as CapturePreviewResult | undefined;
        if (result?.success && result.dataUrl) {
          setSelection({
            dataUrl: result.dataUrl,
            label: clipLabel(`${win.appName} — ${win.title}`),
            rect: result.rect ?? {
              height: win.overlayBounds.height,
              width: win.overlayBounds.width,
              x: win.overlayBounds.x,
              y: win.overlayBounds.y,
            },
          });
        }
      } finally {
        capturingRef.current = false;
      }
    },
    [],
  );

  const previewRect = useCallback(
    async (overlayLocalRect: { height: number; width: number; x: number; y: number }) => {
      if (capturingRef.current) return;
      capturingRef.current = true;
      try {
        const result = (await window.electronAPI?.invoke?.(
          'screenCapture.previewRect',
          overlayLocalRect,
        )) as CapturePreviewResult | undefined;
        if (result?.success && result.dataUrl) {
          setSelection({
            dataUrl: result.dataUrl,
            label: OVERLAY_COPY.customRegionLabel,
            rect: overlayLocalRect,
          });
        }
      } finally {
        capturingRef.current = false;
      }
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (selection) return; // locked until retake
      if (e.button === 2) {
        handleClose();
        return;
      }
      if (e.button !== 0) return;

      pointerStartRef.current = { x: e.clientX, y: e.clientY };

      if (hoveredWindow) {
        pendingWindowRef.current = hoveredWindow;
      } else {
        pendingWindowRef.current = null;
        onMouseDown(e.clientX, e.clientY);
      }
    },
    [selection, hoveredWindow, onMouseDown, handleClose],
  );

  const handleMouseMoveEvent = useCallback(
    (e: ReactMouseEvent) => {
      if (selection) return;
      const pointerStart = pointerStartRef.current;

      if (pointerStart && pendingWindowRef.current && !isDragging) {
        const deltaX = Math.abs(e.clientX - pointerStart.x);
        const deltaY = Math.abs(e.clientY - pointerStart.y);

        if (
          deltaX >= OVERLAY_LAYOUT.clickToDragThreshold ||
          deltaY >= OVERLAY_LAYOUT.clickToDragThreshold
        ) {
          pendingWindowRef.current = null;
          onMouseDown(pointerStart.x, pointerStart.y);
          onMouseMove(e.clientX, e.clientY);
          return;
        }
      }

      if (isDragging) {
        onMouseMove(e.clientX, e.clientY);
      } else {
        hitTest(e.clientX, e.clientY);
      }
    },
    [selection, isDragging, onMouseDown, onMouseMove, hitTest],
  );

  const handleMouseUp = useCallback(() => {
    if (selection) return;

    const pendingWindow = pendingWindowRef.current;
    pendingWindowRef.current = null;
    pointerStartRef.current = null;

    if (pendingWindow && !isDragging) {
      void previewWindow(pendingWindow);
      return;
    }

    if (isDragging && dragRect) {
      if (
        dragRect.width >= OVERLAY_LAYOUT.minDragSize &&
        dragRect.height >= OVERLAY_LAYOUT.minDragSize
      ) {
        void previewRect(dragRect);
      }
      reset();
    }
    onMouseUp();
  }, [selection, isDragging, dragRect, reset, onMouseUp, previewWindow, previewRect]);

  const showHover = hoveredWindow && !isDragging && !selection;
  const showDrag = isDragging && dragRect && !selection;

  return (
    <div
      className={styles.overlay}
      style={{
        cursor: selection
          ? 'default'
          : isDragging
            ? 'crosshair'
            : hoveredWindow
              ? 'pointer'
              : 'crosshair',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMoveEvent}
      onMouseUp={handleMouseUp}
    >
      {showHover && (
        <>
          <div
            className={styles.windowHighlight}
            style={{
              height: hoveredWindow.overlayBounds.height,
              left: hoveredWindow.overlayBounds.x,
              top: hoveredWindow.overlayBounds.y,
              width: hoveredWindow.overlayBounds.width,
            }}
          />
          <WindowTag viewportWidth={viewportWidth} window={hoveredWindow} />
        </>
      )}

      {showDrag && dragRect && (
        <div
          className={styles.selection}
          style={{
            height: dragRect.height,
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.width,
          }}
        />
      )}

      {selection && (
        <div
          className={styles.selection}
          style={{
            height: selection.rect.height,
            left: selection.rect.x,
            top: selection.rect.y,
            width: selection.rect.width,
          }}
        />
      )}

      <ChatPanel
        selection={selection}
        viewportHeight={viewportHeight}
        viewportWidth={viewportWidth}
        onRetake={handleRetake}
        onSubmit={handleSubmit}
      />
    </div>
  );
});

ScreenCaptureOverlay.displayName = 'ScreenCaptureOverlay';

export default ScreenCaptureOverlay;
