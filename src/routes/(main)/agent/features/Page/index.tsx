'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { useParams } from 'react-router-dom';

import FloatingChatPanel from '@/features/FloatingChatPanel';

const AgentPage = memo(() => {
  const params = useParams<{ aid?: string }>();

  if (!params.aid) return null;

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
        topicId={null}
        variant={'embedded'}
      />
    </Flexbox>
  );
});

export default AgentPage;
