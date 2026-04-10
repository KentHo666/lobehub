'use client';

import { type UIChatMessage } from '@lobechat/types';
import { FloatingSheet, type FloatingSheetProps } from '@lobehub/ui/base-ui';
import { memo, useMemo } from 'react';

import { type ActionsBarConfig, ConversationProvider } from '@/features/Conversation';
import { type ConversationContext } from '@/features/Conversation/types';
import { useOperationState } from '@/hooks/useOperationState';
import { useActionsBarConfig } from '@/routes/(main)/agent/features/Conversation/useActionsBarConfig';
import { useChatStore } from '@/store/chat';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import ChatBody from './ChatBody';
import { useSingleInstanceGuard } from './guard';

export interface FloatingChatPanelProps extends Pick<
  FloatingSheetProps,
  | 'activeSnapPoint'
  | 'className'
  | 'dismissible'
  | 'headerActions'
  | 'maxHeight'
  | 'minHeight'
  | 'mode'
  | 'onOpenChange'
  | 'onSnapPointChange'
  | 'open'
  | 'snapPoints'
  | 'title'
  | 'variant'
  | 'width'
> {
  /**
   * Override the actions bar config. When omitted, defaults to the shared
   * `useActionsBarConfig()` hook for parity with the main agent page.
   */
  actionsBar?: ActionsBarConfig;
  /** Agent identifier. */
  agentId: string;
  /** Optional thread identifier. When provided, scope becomes `'thread'`. */
  threadId?: string | null;
  /** Topic identifier. `null` means a new / unpersisted conversation. */
  topicId: string | null;
}

/**
 * FloatingChatPanel
 *
 * A reusable floating conversation panel. Composes ChatList + MainChatInput inside
 * a @lobehub/ui FloatingSheet. Consumers provide conversation coordinates via flat
 * `agentId`/`topicId` props; the component builds its own `ConversationContext`
 * internally.
 *
 * ⚠️ Single instance per page. Mounting a second FloatingChatPanel while one is
 * already mounted will throw. See `./guard.ts` for the rationale.
 *
 * ⚠️ Must not coexist with the main-page ConversationArea (both use MainChatInput,
 * which writes to the global `useChatStore.mainInputEditor` slot). This is NOT
 * enforced at runtime — consumer responsibility.
 */
const FloatingChatPanel = memo<FloatingChatPanelProps>(
  ({
    agentId,
    topicId,
    threadId = null,
    actionsBar,
    snapPoints = [0.5, 0.9],
    minHeight = 240,
    maxHeight = 0.9,
    mode = 'overlay',
    variant = 'elevated',
    width = '100%',
    dismissible = false,
    open,
    onOpenChange,
    activeSnapPoint,
    onSnapPointChange,
    title,
    headerActions,
    className,
  }) => {
    useSingleInstanceGuard();

    const context = useMemo<ConversationContext>(
      () => ({
        agentId,
        scope: threadId ? 'thread' : 'main',
        threadId,
        topicId,
      }),
      [agentId, topicId, threadId],
    );

    const chatKey = useMemo(() => messageMapKey(context), [context]);
    const messages = useChatStore((s) => s.dbMessagesMap[chatKey]);
    const replaceMessages = useChatStore((s) => s.replaceMessages);

    const operationState = useOperationState(context);
    const defaultActionsBar = useActionsBarConfig();
    const resolvedActionsBar = actionsBar ?? defaultActionsBar;

    const handleMessagesChange = useMemo(
      () => (next: UIChatMessage[], ctx: ConversationContext) => {
        replaceMessages(next, { context: ctx });
      },
      [replaceMessages],
    );

    const sheetOpenProps = open === undefined ? { defaultOpen: true } : { open, onOpenChange };

    return (
      <FloatingSheet
        activeSnapPoint={activeSnapPoint}
        className={className}
        dismissible={dismissible}
        headerActions={headerActions}
        maxHeight={maxHeight}
        minHeight={minHeight}
        mode={mode}
        snapPoints={snapPoints}
        title={title}
        variant={variant}
        width={width}
        onSnapPointChange={onSnapPointChange}
        {...sheetOpenProps}
      >
        <ConversationProvider
          actionsBar={resolvedActionsBar}
          context={context}
          hasInitMessages={!!messages}
          messages={messages}
          operationState={operationState}
          onMessagesChange={handleMessagesChange}
        >
          <ChatBody />
        </ConversationProvider>
      </FloatingSheet>
    );
  },
);

FloatingChatPanel.displayName = 'FloatingChatPanel';

export default FloatingChatPanel;
