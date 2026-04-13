import type { ScreenCaptureWindowInfo } from '@lobechat/electron-client-ipc';
import { useCallback, useState } from 'react';

export function useWindowHighlight(windows: ScreenCaptureWindowInfo[]) {
  const [hoveredWindow, setHoveredWindow] = useState<ScreenCaptureWindowInfo | null>(null);

  const handleMouseMove = useCallback(
    (clientX: number, clientY: number) => {
      for (const win of windows) {
        const { x, y, width, height } = win.bounds;
        if (clientX >= x && clientX <= x + width && clientY >= y && clientY <= y + height) {
          setHoveredWindow(win);
          return;
        }
      }
      setHoveredWindow(null);
    },
    [windows],
  );

  return { handleMouseMove, hoveredWindow };
}
