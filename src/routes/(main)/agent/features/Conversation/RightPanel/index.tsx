import { ActionIcon, Flexbox } from '@lobehub/ui';
import { PanelRightCloseIcon } from 'lucide-react';
import { memo } from 'react';

import { DESKTOP_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import NavHeader from '@/features/NavHeader';
import RightPanel from '@/features/RightPanel';
import { useGlobalStore } from '@/store/global';

import AgentSummary from './AgentSummary';
import ProgressSection from './ProgressSection';
import ResourcesSection from './ResourcesSection';

interface AgentWorkspaceRightPanelProps {
  onSelectDocument: (id: string | null) => void;
  selectedDocumentId: string | null;
}

const AgentWorkspaceRightPanel = memo<AgentWorkspaceRightPanelProps>(
  ({ onSelectDocument, selectedDocumentId }) => {
    const toggleRightPanel = useGlobalStore((s) => s.toggleRightPanel);

    return (
      <RightPanel defaultWidth={360} maxWidth={520} minWidth={300}>
        <Flexbox height={'100%'} width={'100%'}>
          <NavHeader
            showTogglePanelButton={false}
            right={
              <ActionIcon
                icon={PanelRightCloseIcon}
                size={DESKTOP_HEADER_ICON_SIZE}
                onClick={() => toggleRightPanel(false)}
              />
            }
            style={{
              paddingBlock: 8,
              paddingInline: 8,
              position: 'absolute',
            }}
          />
          <Flexbox gap={8} height={'100%'} style={{ overflowY: 'auto' }} width={'100%'}>
            <AgentSummary />
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
