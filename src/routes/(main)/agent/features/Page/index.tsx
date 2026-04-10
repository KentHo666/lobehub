'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { useParams } from 'react-router-dom';

import FloatingChatPanel from '@/features/FloatingChatPanel';

const TopicPage = memo(() => {
  const params = useParams<{ aid?: string; topicId?: string }>();

  if (!params.aid || !params.topicId) return null;

  return (
    <Flexbox
      data-testid="agent-page-container"
      height={'100%'}
      style={{ minHeight: 0, position: 'relative' }}
      width={'100%'}
    >
      <FloatingChatPanel
        open
        agentId={params.aid}
        maxHeight={0.92}
        minHeight={320}
        title={'Floating Chat Panel'}
        topicId={params.topicId}
        variant={'embedded'}
      />
    </Flexbox>
  );
});

export default TopicPage;
