import { type UploadFileItem } from '@/types/files/upload';

export interface PendingOverlayDispatch {
  agentId: string;
  dispatchId: string;
  prompt: string;
  screenshotFileName: string;
}

interface CanConsumePendingOverlayDispatchParams {
  agentId?: string | null;
  isAgentConfigLoading: boolean;
  messagesInit: boolean;
  pendingDispatch: PendingOverlayDispatch | null;
  routeAgentId?: string | null;
  topicId?: string | null;
}

interface SelectPendingOverlayDispatchFilesParams {
  fileList: readonly UploadFileItem[];
  pendingDispatch: PendingOverlayDispatch;
}

export const createOverlayScreenshotFilename = (dispatchId: string) =>
  `screen-capture-${dispatchId}.png`;

export const canConsumePendingOverlayDispatch = ({
  agentId,
  isAgentConfigLoading,
  messagesInit,
  pendingDispatch,
  routeAgentId,
  topicId,
}: CanConsumePendingOverlayDispatchParams) => {
  if (!pendingDispatch || !agentId) return false;
  if (pendingDispatch.agentId !== agentId) return false;
  if (routeAgentId && routeAgentId !== agentId) return false;

  const isNewConversation = !topicId;

  return !isAgentConfigLoading && (isNewConversation || messagesInit);
};

export const selectPendingOverlayDispatchFiles = ({
  fileList,
  pendingDispatch,
}: SelectPendingOverlayDispatchFilesParams) =>
  fileList.filter((file) => file.file?.name === pendingDispatch.screenshotFileName);
