import { describe, expect, it } from 'vitest';

import { resolvePanelPlacement } from './panelPlacement';

describe('resolvePanelPlacement', () => {
  it('keeps the last selection placement instead of falling back to the initial dock', () => {
    expect(
      resolvePanelPlacement({
        dockedPlacement: null,
        initialPlacement: { left: 480, top: 720, width: 420 },
        lastSelectionPlacement: { left: 812, top: 168, width: 360 },
      }),
    ).toEqual({
      left: 812,
      top: 168,
      width: 360,
    });
  });
});
