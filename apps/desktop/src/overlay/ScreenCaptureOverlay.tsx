import type { ScreenCaptureSession } from '@lobechat/electron-client-ipc';
import { memo, useCallback, useEffect, useState } from 'react';

import { useDragSelection } from './useDragSelection';
import { useWindowHighlight } from './useWindowHighlight';
import WindowTag from './WindowTag';

const HIGHLIGHT_BORDER_WIDTH = 2;
const HIGHLIGHT_COLOR = 'rgba(24, 144, 255, 0.8)';
const DRAG_FILL_COLOR = 'rgba(24, 144, 255, 0.15)';
const DRAG_STROKE_COLOR = 'rgba(24, 144, 255, 0.8)';
const OVERLAY_BG = 'rgba(0, 0, 0, 0.25)';
const MIN_DRAG_SIZE = 10;

const invoke = (...args: any[]) => (window as any).electronAPI?.invoke?.(...args);

const ScreenCaptureOverlay = memo(() => {
  const [session, setSession] = useState<ScreenCaptureSession | null>(null);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron) return;

    const listener = (_e: any, data: ScreenCaptureSession) => {
      setSession(data);
    };

    electron.ipcRenderer.on('screenCaptureSession', listener);
    return () => {
      electron.ipcRenderer.removeListener('screenCaptureSession', listener);
    };
  }, []);

  const windows = session?.windows ?? [];
  const { hoveredWindow, handleMouseMove: hitTest } = useWindowHighlight(windows);
  const { dragRect, isDragging, onMouseDown, onMouseMove, onMouseUp, reset } = useDragSelection();

  const handleClose = useCallback(() => {
    invoke('screenCapture.close');
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 2) {
        handleClose();
        return;
      }
      if (e.button !== 0) return;

      if (hoveredWindow) {
        invoke('screenCapture.captureWindow', hoveredWindow.windowId);
      } else {
        onMouseDown(e.clientX, e.clientY);
      }
    },
    [hoveredWindow, onMouseDown, handleClose],
  );

  const handleMouseMoveEvent = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        onMouseMove(e.clientX, e.clientY);
      } else {
        hitTest(e.clientX, e.clientY);
      }
    },
    [isDragging, onMouseMove, hitTest],
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragRect) {
      if (dragRect.width >= MIN_DRAG_SIZE && dragRect.height >= MIN_DRAG_SIZE) {
        invoke('screenCapture.captureRect', {
          height: dragRect.height,
          width: dragRect.width,
          x: dragRect.x + (session?.displayBounds.x ?? 0),
          y: dragRect.y + (session?.displayBounds.y ?? 0),
        });
      }
      reset();
    }
    onMouseUp();
  }, [isDragging, dragRect, session, reset, onMouseUp]);

  return (
    <div
      style={{
        background: OVERLAY_BG,
        cursor: isDragging ? 'crosshair' : hoveredWindow ? 'pointer' : 'crosshair',
        height: '100vh',
        left: 0,
        position: 'fixed',
        top: 0,
        userSelect: 'none',
        width: '100vw',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMoveEvent}
      onMouseUp={handleMouseUp}
    >
      {hoveredWindow && !isDragging && (
        <>
          <div
            style={{
              border: `${HIGHLIGHT_BORDER_WIDTH}px solid ${HIGHLIGHT_COLOR}`,
              borderRadius: 4,
              height: hoveredWindow.bounds.height,
              left: hoveredWindow.bounds.x,
              pointerEvents: 'none',
              position: 'absolute',
              top: hoveredWindow.bounds.y,
              width: hoveredWindow.bounds.width,
            }}
          />
          <WindowTag window={hoveredWindow} />
        </>
      )}

      {isDragging && dragRect && (
        <div
          style={{
            background: DRAG_FILL_COLOR,
            border: `${HIGHLIGHT_BORDER_WIDTH}px solid ${DRAG_STROKE_COLOR}`,
            height: dragRect.height,
            left: dragRect.x,
            pointerEvents: 'none',
            position: 'absolute',
            top: dragRect.y,
            width: dragRect.width,
          }}
        />
      )}
    </div>
  );
});

ScreenCaptureOverlay.displayName = 'ScreenCaptureOverlay';

export default ScreenCaptureOverlay;
