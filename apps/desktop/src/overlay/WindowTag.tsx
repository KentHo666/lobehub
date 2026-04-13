import type { ScreenCaptureWindowInfo } from '@lobechat/electron-client-ipc';
import { memo } from 'react';

interface WindowTagProps {
  window: ScreenCaptureWindowInfo;
}

const WindowTag = memo<WindowTagProps>(({ window: win }) => {
  const { x, y } = win.bounds;

  return (
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 4,
        color: '#fff',
        fontSize: 12,
        left: x,
        maxWidth: 200,
        overflow: 'hidden',
        padding: '2px 8px',
        pointerEvents: 'none',
        position: 'absolute',
        textOverflow: 'ellipsis',
        top: y - 24,
        whiteSpace: 'nowrap',
        zIndex: 10,
      }}
    >
      {win.appName}
      {win.title ? ` - ${win.title}` : ''}
    </div>
  );
});

WindowTag.displayName = 'WindowTag';

export default WindowTag;
