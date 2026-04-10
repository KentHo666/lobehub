import { type ChatInputEditor } from '@/features/ChatInput';

/**
 * Page-level runtime overrides for plugin/tool behavior.
 * Transient state, not persisted — cleared on reload or when pages unmount.
 */
export interface RuntimePluginOverrides {
  /**
   * Force these tool ids to be activated for every step on the current page,
   * bypassing enableChecker rules via `isExplicitActivation`.
   * Merged into stepContext.activatedToolIds in streamingExecutor.
   */
  forceActivated?: string[];
}

export interface ChatAIChatState {
  inputFiles: File[];
  inputMessage: string;
  mainInputEditor: ChatInputEditor | null;
  /**
   * Page-level runtime plugin overrides. Set by page layouts (e.g. tasks page
   * forcing `lobe-task` to be activated), cleared on unmount.
   */
  runtimePluginOverrides?: RuntimePluginOverrides;
  searchWorkflowLoadingIds: string[];
  threadInputEditor: ChatInputEditor | null;
  /**
   * the tool calling stream ids
   */
  toolCallingStreamIds: Record<string, boolean[]>;
}

export const initialAiChatState: ChatAIChatState = {
  inputFiles: [],
  inputMessage: '',
  mainInputEditor: null,
  runtimePluginOverrides: undefined,
  searchWorkflowLoadingIds: [],
  threadInputEditor: null,
  toolCallingStreamIds: {},
};
