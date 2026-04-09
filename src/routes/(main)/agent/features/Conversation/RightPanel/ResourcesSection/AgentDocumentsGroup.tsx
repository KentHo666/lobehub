import { type SkillResourceTreeNode } from '@lobechat/types';
import { Flexbox, Text } from '@lobehub/ui';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import FileTree, { FileTreeSkeleton } from '@/features/FileTree';
import { useClientDataSWR } from '@/libs/swr';
import { agentDocumentService } from '@/services/agentDocument';
import { useAgentStore } from '@/store/agent';

interface AgentDocumentsGroupProps {
  onSelectDocument: (id: string | null) => void;
  selectedDocumentId: string | null;
}

const AgentDocumentsGroup = memo<AgentDocumentsGroupProps>(
  ({ onSelectDocument, selectedDocumentId }) => {
    const { t } = useTranslation('chat');
    const agentId = useAgentStore((s) => s.activeAgentId);

    const {
      data = [],
      error,
      isLoading,
    } = useClientDataSWR(agentId ? ['workspace-agent-documents', agentId] : null, () =>
      agentDocumentService.getDocuments({ agentId: agentId! }),
    );

    const resourceTree = useMemo<SkillResourceTreeNode[]>(
      () => [
        {
          children: data.map((item) => ({
            name: item.filename || item.title,
            path: item.id,
            type: 'file' as const,
          })),
          name: t('agentWorkspace.agentDocuments'),
          path: 'agent-documents',
          type: 'directory' as const,
        },
      ],
      [data, t],
    );

    if (!agentId) return null;

    return (
      <Flexbox gap={8}>
        {isLoading && <FileTreeSkeleton rows={6} showRootFile={false} />}
        {error && <Text type={'danger'}>{t('agentWorkspace.resources.error')}</Text>}
        {!isLoading && !error && data.length === 0 && (
          <Text type={'secondary'}>{t('agentWorkspace.resources.empty')}</Text>
        )}
        {!isLoading && !error && data.length > 0 && (
          <FileTree
            resourceTree={resourceTree}
            rootFile={null}
            selectedFile={selectedDocumentId || ''}
            onSelectFile={onSelectDocument}
          />
        )}
      </Flexbox>
    );
  },
);

AgentDocumentsGroup.displayName = 'AgentDocumentsGroup';

export default AgentDocumentsGroup;
