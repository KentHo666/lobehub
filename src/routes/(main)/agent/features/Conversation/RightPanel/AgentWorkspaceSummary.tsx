import { Avatar, Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

const AgentWorkspaceSummary = memo(() => {
  const { t } = useTranslation('chat');
  const meta = useAgentStore(agentSelectors.currentAgentMeta);
  const title = meta.title || t('untitledAgent');

  return (
    <Flexbox
      horizontal
      align={'center'}
      data-testid="workspace-summary"
      gap={12}
      padding={16}
      width={'100%'}
    >
      <Avatar avatar={meta.avatar} background={meta.backgroundColor} shape={'square'} size={40} />
      <Flexbox gap={4} style={{ minWidth: 0 }}>
        <strong>{title}</strong>
      </Flexbox>
    </Flexbox>
  );
});

AgentWorkspaceSummary.displayName = 'AgentWorkspaceSummary';

export default AgentWorkspaceSummary;
