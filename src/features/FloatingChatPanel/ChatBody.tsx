'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';

import { ChatList } from '@/features/Conversation';
import MainChatInput from '@/routes/(main)/agent/features/Conversation/MainChatInput';

/**
 * Inner body of FloatingChatPanel.
 *
 * Assumes it is rendered inside a ConversationProvider. Pure layout — does not
 * read the chat store directly.
 */
const ChatBody = memo(() => {
  return (
    <>
      <Flexbox
        flex={1}
        width={'100%'}
        style={{
          overflowX: 'hidden',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <ChatList />
      </Flexbox>
      <MainChatInput />
    </>
  );
});

ChatBody.displayName = 'FloatingChatPanelBody';

export default ChatBody;
