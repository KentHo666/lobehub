import { useCallback, useRef, useState } from 'react';

export interface DragRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function useDragSelection() {
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onMouseDown = useCallback((clientX: number, clientY: number) => {
    startRef.current = { x: clientX, y: clientY };
    setIsDragging(true);
    setDragRect(null);
  }, []);

  const onMouseMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging || !startRef.current) return;

      const sx = startRef.current.x;
      const sy = startRef.current.y;

      setDragRect({
        height: Math.abs(clientY - sy),
        width: Math.abs(clientX - sx),
        x: Math.min(clientX, sx),
        y: Math.min(clientY, sy),
      });
    },
    [isDragging],
  );

  const onMouseUp = useCallback(() => {
    setIsDragging(false);
    startRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setDragRect(null);
    setIsDragging(false);
    startRef.current = null;
  }, []);

  return { dragRect, isDragging, onMouseDown, onMouseMove, onMouseUp, reset };
}
