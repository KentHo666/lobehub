'use client';

import { SESSION_CHAT_URL } from '@lobechat/const';
import { nanoid } from '@lobechat/utils';
import {
  type OverlayDispatchMessagePayload,
  useWatchBroadcast,
} from '@lobechat/electron-client-ipc';
import { memo, useCallback } from 'react';

import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { useFileStore } from '@/store/file';

import { createOverlayScreenshotFilename } from './overlayDispatch';
import { getOverlayDispatchStoreState } from './overlayDispatchStore';

const dataUrlToFile = async ({
  dataUrl,
  filename,
}: {
  dataUrl: string;
  filename: string;
}): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/png' });
};

/**
 * Receives screen-capture overlay submissions forwarded by the main process and
 * forwards them through the main renderer's normal navigation path. The actual
 * `sendMessage` call is deferred until the target agent conversation has fully
 * mounted and loaded its configuration.
 */
const OverlayMessageDispatcher = memo(() => {
  const router = useQueryRoute();

  const handler = useCallback(
    async (payload: OverlayDispatchMessagePayload) => {
      const inboxAgentId = builtinAgentSelectors.inboxAgentId(useAgentStore.getState());
      const agentId = payload.agentId || inboxAgentId;
      if (!agentId) return;

      const dispatchId = nanoid();
      const screenshotFileName = createOverlayScreenshotFilename(dispatchId);

      try {
        const file = await dataUrlToFile({ dataUrl: payload.dataUrl, filename: screenshotFileName });
        await useFileStore.getState().uploadChatFiles([file]);
      } catch (error) {
        console.warn('[OverlayMessageDispatcher] upload screenshot failed:', error);
      }

      getOverlayDispatchStoreState().setPendingDispatch({
        agentId,
        dispatchId,
        prompt: payload.prompt,
        screenshotFileName,
      });

      const { activeAgentId, activeTopicId, switchTopic } = useChatStore.getState();
      if (activeAgentId === agentId && activeTopicId) {
        await switchTopic(null, { skipRefreshMessage: true });
      }

      router.push(SESSION_CHAT_URL(agentId, false));
    },
    [router],
  );

  useWatchBroadcast('overlayDispatchMessage', handler);

  return null;
});

OverlayMessageDispatcher.displayName = 'OverlayMessageDispatcher';

export default OverlayMessageDispatcher;
