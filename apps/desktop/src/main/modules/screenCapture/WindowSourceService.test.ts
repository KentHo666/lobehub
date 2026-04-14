import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWindows = vi.fn();
const mockOpenWindows = vi.fn();

vi.mock('electron', () => ({
  app: {
    getName: vi.fn(() => 'LobeHub'),
  },
}));

vi.mock('node-screenshots', () => ({
  Window: {
    all: mockWindows,
  },
}));

vi.mock('get-windows', () => ({
  openWindows: mockOpenWindows,
}));

describe('WindowSourceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves window geometry on retina displays without dividing by scale factor', async () => {
    mockOpenWindows.mockResolvedValue([{ owner: { processId: 42 } }]);
    mockWindows.mockReturnValue([
      {
        appName: () => 'Finder',
        height: () => 900,
        id: () => 1001,
        isMinimized: () => false,
        pid: () => 42,
        title: () => 'Example',
        width: () => 1440,
        x: () => 200,
        y: () => 100,
        z: () => 10,
      },
    ]);

    const { enumerateWindows } = await import('./WindowSourceService');

    const windows = await enumerateWindows({
      height: 1620,
      width: 2880,
      x: 0,
      y: 0,
    });

    expect(windows).toEqual([
      {
        appName: 'Finder',
        bounds: {
          height: 900,
          width: 1440,
          x: 200,
          y: 100,
        },
        order: 0,
        overlayBounds: {
          height: 900,
          width: 1440,
          x: 200,
          y: 100,
        },
        title: 'Example',
        windowId: 1001,
      },
    ]);
  });
});
