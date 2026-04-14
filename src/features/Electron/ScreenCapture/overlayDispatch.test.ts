import { describe, expect, it } from 'vitest';

import { type UploadFileItem } from '@/types/files/upload';

import {
  canConsumePendingOverlayDispatch,
  createOverlayScreenshotFilename,
  selectPendingOverlayDispatchFiles,
} from './overlayDispatch';

describe('overlayDispatch', () => {
  describe('canConsumePendingOverlayDispatch', () => {
    it('allows a new conversation before messages initialize', () => {
      expect(
        canConsumePendingOverlayDispatch({
          agentId: 'agent-1',
          isAgentConfigLoading: false,
          messagesInit: false,
          pendingDispatch: {
            agentId: 'agent-1',
            dispatchId: 'dispatch-1',
            prompt: 'hello',
            screenshotFileName: 'screen-capture-dispatch-1.png',
          },
          routeAgentId: 'agent-1',
          topicId: null,
        }),
      ).toBe(true);
    });

    it('waits for existing conversation messages to initialize', () => {
      expect(
        canConsumePendingOverlayDispatch({
          agentId: 'agent-1',
          isAgentConfigLoading: false,
          messagesInit: false,
          pendingDispatch: {
            agentId: 'agent-1',
            dispatchId: 'dispatch-1',
            prompt: 'hello',
            screenshotFileName: 'screen-capture-dispatch-1.png',
          },
          routeAgentId: 'agent-1',
          topicId: 'topic-1',
        }),
      ).toBe(false);
    });

    it('blocks when the route has not switched to the pending agent', () => {
      expect(
        canConsumePendingOverlayDispatch({
          agentId: 'agent-1',
          isAgentConfigLoading: false,
          messagesInit: true,
          pendingDispatch: {
            agentId: 'agent-1',
            dispatchId: 'dispatch-1',
            prompt: 'hello',
            screenshotFileName: 'screen-capture-dispatch-1.png',
          },
          routeAgentId: 'agent-2',
          topicId: null,
        }),
      ).toBe(false);
    });
  });

  describe('selectPendingOverlayDispatchFiles', () => {
    it('keeps only files created by the overlay dispatch', () => {
      const fileList = [
        { file: new File(['a'], 'existing.png', { type: 'image/png' }), id: 'existing' },
        {
          file: new File(['b'], createOverlayScreenshotFilename('dispatch-1'), {
            type: 'image/png',
          }),
          id: 'overlay',
        },
      ] as UploadFileItem[];

      expect(
        selectPendingOverlayDispatchFiles({
          fileList,
          pendingDispatch: {
            agentId: 'agent-1',
            dispatchId: 'dispatch-1',
            prompt: 'hello',
            screenshotFileName: createOverlayScreenshotFilename('dispatch-1'),
          },
        }),
      ).toEqual([fileList[1]]);
    });
  });
});
