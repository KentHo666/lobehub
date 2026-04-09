import { ActionIcon, Flexbox, Text } from '@lobehub/ui';
import { PanelRightCloseIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { DESKTOP_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import NavHeader from '@/features/NavHeader';
import RightPanel from '@/features/RightPanel';
import { useGlobalStore } from '@/store/global';

import AgentWorkspaceSummary from './AgentWorkspaceSummary';
import ProgressSection from './ProgressSection';
import ResourcesSection from './ResourcesSection';

interface AgentWorkspaceRightPanelProps {
  onSelectDocument: (id: string | null) => void;
  selectedDocumentId: string | null;
}

const AgentWorkspaceRightPanel = memo<AgentWorkspaceRightPanelProps>(
  ({ onSelectDocument, selectedDocumentId }) => {
    const { t } = useTranslation('chat');
    const toggleRightPanel = useGlobalStore((s) => s.toggleRightPanel);

    return (
      <RightPanel defaultWidth={360} maxWidth={520} minWidth={300}>
        <Flexbox height={'100%'} width={'100%'}>
          <NavHeader
            left={<Text type={'secondary'}>{t('agentWorkspace.title')}</Text>}
            showTogglePanelButton={false}
            style={{ paddingBlock: 8, paddingInline: 8 }}
            right={
              <ActionIcon
                icon={PanelRightCloseIcon}
                size={DESKTOP_HEADER_ICON_SIZE}
                onClick={() => toggleRightPanel(false)}
              />
            }
          />
          <Flexbox gap={8} height={'100%'} style={{ overflowY: 'auto' }} width={'100%'}>
            <AgentWorkspaceSummary />
            <ProgressSection />
            <ResourcesSection
              selectedDocumentId={selectedDocumentId}
              onSelectDocument={onSelectDocument}
            />
          </Flexbox>
        </Flexbox>
      </RightPanel>
    );
  },
);

export default AgentWorkspaceRightPanel;
