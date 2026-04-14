import type { CapturePreviewResult, ScreenCaptureSession } from '@lobechat/electron-client-ipc';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ChatPanel, { type ChatPanelSelection, type ChatPanelSubmitPayload } from './ChatPanel';
import { OVERLAY_COPY, OVERLAY_LAYOUT } from './constants';
import { resolveCommittedSelectionRect, shouldHideChatPanel } from './overlaySelectionState';
import * as styles from './overlay.css.ts';
import { useDragSelection } from './useDragSelection';
import { getTopmostWindowAtPoint, useWindowHighlight } from './useWindowHighlight';
import WindowTag from './WindowTag';

const clipLabel = (text: string, max = OVERLAY_LAYOUT.labelClipLength): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const ScreenCaptureOverlay = memo(() => {
  const [isPanelHidden, setIsPanelHidden] = useState(false);
  const [pendingSelectionRect, setPendingSelectionRect] = useState<
    ChatPanelSelection['rect'] | null
  >(null);
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

  const windows = useMemo(() => session?.windows ?? [], [session?.windows]);
  const { hoveredWindow, handleMouseMove: hitTest } = useWindowHighlight(windows);
  const {
    dragRect,
    dragRectRef,
    isDragging,
    isDraggingRef,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    reset,
  } = useDragSelection();

  const viewportWidth = session?.displayBounds.width ?? window.innerWidth;
  const viewportHeight = session?.displayBounds.height ?? window.innerHeight;

  const traceOverlayEvent = useCallback((event: string, data?: unknown) => {
    void window.electronAPI?.invoke?.('screenCapture.traceOverlayEvent', {
      data,
      event,
    });
  }, []);

  const handleClose = useCallback(() => {
    traceOverlayEvent('overlay.close');
    window.electronAPI?.invoke?.('screenCapture.close');
  }, [traceOverlayEvent]);

  const clearSelection = useCallback(() => {
    traceOverlayEvent('selection.clear', {
      pendingSelectionRect,
      selectionRect: selection?.rect ?? null,
    });
    setIsPanelHidden(false);
    setPendingSelectionRect(null);
    setSelection(null);
    reset();
  }, [pendingSelectionRect, reset, selection?.rect, traceOverlayEvent]);

  const handleSubmit = useCallback((payload: ChatPanelSubmitPayload) => {
    window.electronAPI?.invoke?.('screenCapture.submit', {
      agentId: payload.agentId,
      dataUrl: payload.selection.dataUrl,
      modelId: payload.modelId,
      prompt: payload.prompt,
      provider: payload.provider,
      rect: payload.selection.rect,
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  const previewWindow = useCallback(
    async (win: ScreenCaptureSession['windows'][number]) => {
      if (capturingRef.current) return;
      traceOverlayEvent('previewWindow.request', {
        overlayBounds: win.overlayBounds,
        windowId: win.windowId,
      });
      capturingRef.current = true;
      try {
        const result = (await window.electronAPI?.invoke?.(
          'screenCapture.previewWindow',
          win.windowId,
        )) as CapturePreviewResult | undefined;
        traceOverlayEvent('previewWindow.result', {
          rect: result?.rect ?? null,
          success: !!result?.success,
          windowId: win.windowId,
        });
        if (result?.success && result.dataUrl) {
          setPendingSelectionRect(null);
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
        } else {
          setPendingSelectionRect(null);
        }
      } finally {
        capturingRef.current = false;
        setIsPanelHidden(false);
      }
    },
    [traceOverlayEvent],
  );

  const previewRect = useCallback(
    async (overlayLocalRect: { height: number; width: number; x: number; y: number }) => {
      if (capturingRef.current) return;
      traceOverlayEvent('previewRect.request', {
        rect: overlayLocalRect,
      });
      capturingRef.current = true;
      try {
        const result = (await window.electronAPI?.invoke?.(
          'screenCapture.previewRect',
          overlayLocalRect,
        )) as CapturePreviewResult | undefined;
        traceOverlayEvent('previewRect.result', {
          rect: overlayLocalRect,
          returnedRect: result?.rect ?? null,
          success: !!result?.success,
        });
        if (result?.success && result.dataUrl) {
          setPendingSelectionRect(null);
          setSelection({
            dataUrl: result.dataUrl,
            label: OVERLAY_COPY.customRegionLabel,
            rect: overlayLocalRect,
          });
        } else {
          setPendingSelectionRect(null);
        }
      } finally {
        capturingRef.current = false;
        setIsPanelHidden(false);
      }
    },
    [traceOverlayEvent],
  );

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (e.button === 2) {
        handleClose();
        return;
      }
      if (e.button !== 0) return;

      // Allow re-selection: any pointer down outside the panel starts a fresh pick.
      // Resolve the current window under the pointer synchronously — `hoveredWindow`
      // from state is stale in the same handler when hit-testing was paused.
      setIsPanelHidden(true);
      setPendingSelectionRect(null);

      const hitWindow = selection
        ? getTopmostWindowAtPoint(windows, e.clientX, e.clientY)
        : hoveredWindow;

      traceOverlayEvent('pointer.down', {
        hadSelection: !!selection,
        hitWindowId: hitWindow?.windowId ?? null,
        point: { x: e.clientX, y: e.clientY },
      });

      if (selection) {
        setSelection(null);
        reset();
        hitTest(e.clientX, e.clientY);
      }

      pointerStartRef.current = { x: e.clientX, y: e.clientY };

      if (hitWindow) {
        pendingWindowRef.current = hitWindow;
      } else {
        pendingWindowRef.current = null;
        onMouseDown(e.clientX, e.clientY);
      }
    },
    [selection, hoveredWindow, windows, onMouseDown, handleClose, reset, hitTest],
  );

  const handleMouseMoveEvent = useCallback(
    (e: ReactMouseEvent) => {
      const pointerStart = pointerStartRef.current;
      const dragging = isDraggingRef.current;

      if (pointerStart && pendingWindowRef.current && !dragging) {
        const deltaX = Math.abs(e.clientX - pointerStart.x);
        const deltaY = Math.abs(e.clientY - pointerStart.y);

        if (
          deltaX >= OVERLAY_LAYOUT.clickToDragThreshold ||
          deltaY >= OVERLAY_LAYOUT.clickToDragThreshold
        ) {
          traceOverlayEvent('drag.threshold-crossed', {
            point: { x: e.clientX, y: e.clientY },
            start: pointerStart,
            windowId: pendingWindowRef.current.windowId,
          });
          pendingWindowRef.current = null;
          onMouseDown(pointerStart.x, pointerStart.y);
          onMouseMove(e.clientX, e.clientY);
          return;
        }
      }

      if (dragging) {
        onMouseMove(e.clientX, e.clientY);
      } else if (!selection) {
        // Only do hit-testing while there is no committed selection; once selected,
        // highlighting a window under the overlay is noisy.
        hitTest(e.clientX, e.clientY);
      }
    },
    [selection, isDraggingRef, onMouseDown, onMouseMove, hitTest],
  );

  const handleMouseUp = useCallback(() => {
    const pendingWindow = pendingWindowRef.current;
    const committedDragRect = dragRectRef.current;
    const dragging = isDraggingRef.current;

    traceOverlayEvent('pointer.up', {
      committedDragRect,
      dragging,
      pendingWindowId: pendingWindow?.windowId ?? null,
    });

    pendingWindowRef.current = null;
    pointerStartRef.current = null;

    if (pendingWindow && !dragging) {
      setPendingSelectionRect({
        height: pendingWindow.overlayBounds.height,
        width: pendingWindow.overlayBounds.width,
        x: pendingWindow.overlayBounds.x,
        y: pendingWindow.overlayBounds.y,
      });
      onMouseUp();
      void previewWindow(pendingWindow);
      return;
    }

    if (dragging && committedDragRect) {
      if (
        committedDragRect.width >= OVERLAY_LAYOUT.minDragSize &&
        committedDragRect.height >= OVERLAY_LAYOUT.minDragSize
      ) {
        setPendingSelectionRect(committedDragRect);
        reset();
        onMouseUp();
        void previewRect(committedDragRect);
        return;
      }
      setIsPanelHidden(false);
      setPendingSelectionRect(null);
      reset();
    }

    if (!dragging) {
      setIsPanelHidden(false);
    }

    onMouseUp();
  }, [dragRectRef, isDraggingRef, reset, onMouseUp, previewWindow, previewRect]);

  const committedSelectionRect = resolveCommittedSelectionRect({
    pendingSelectionRect,
    selection,
  });
  const panelHidden = shouldHideChatPanel({
    isPreviewingSelection: !!pendingSelectionRect,
    isSelecting: isPanelHidden,
  });
  const showHover = hoveredWindow && !isDragging && !committedSelectionRect;
  const showDrag = isDragging && dragRect && !selection;

  return (
    <div
      className={styles.overlay}
      style={{
        cursor: committedSelectionRect
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

      {committedSelectionRect && (
        <div
          className={styles.selection}
          style={{
            height: committedSelectionRect.height,
            left: committedSelectionRect.x,
            top: committedSelectionRect.y,
            width: committedSelectionRect.width,
          }}
        />
      )}

      <ChatPanel
        agentId={session?.defaultAgentId}
        agents={session?.agents}
        hidden={panelHidden}
        modelId={session?.defaultModelId}
        models={session?.models}
        selection={selection}
        theme={session?.theme}
        viewportHeight={viewportHeight}
        viewportWidth={viewportWidth}
        onClearSelection={clearSelection}
        onSubmit={handleSubmit}
      />
    </div>
  );
});

ScreenCaptureOverlay.displayName = 'ScreenCaptureOverlay';

export default ScreenCaptureOverlay;
