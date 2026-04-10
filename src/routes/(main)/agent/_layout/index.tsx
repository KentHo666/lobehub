import { Flexbox } from '@lobehub/ui';
import { type FC, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { isDesktop } from '@/const/version';
import ProtocolUrlHandler from '@/features/ProtocolUrlHandler';
import { useInitAgentConfig } from '@/hooks/useInitAgentConfig';
import AgentIdSync from '@/routes/(main)/agent/_layout/AgentIdSync';
import AgentWorkspaceRightPanel from '@/routes/(main)/agent/features/Conversation/RightPanel';
import ViewerPanel from '@/routes/(main)/agent/features/Conversation/ViewerPanel';
import { useAgentStore } from '@/store/agent';

import RegisterHotkeys from './RegisterHotkeys';
import Sidebar from './Sidebar';
import { styles } from './style';

const TOPIC_ID_PREFIX = 'tpc_';

const noopSelectDocument = () => {};

const isChatRoute = (pathname: string) => {
  const segments = pathname.split('/').filter(Boolean).slice(2);

  if (segments.length === 0) return true;

  return segments.length === 1 && segments[0].startsWith(TOPIC_ID_PREFIX);
};

const Layout: FC = () => {
  useInitAgentConfig();
  const location = useLocation();
  const activeAgentId = useAgentStore((s) => s.activeAgentId);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const showChatViewer = isChatRoute(location.pathname);

  useEffect(() => {
    setSelectedDocumentId(null);
  }, [activeAgentId]);

  useEffect(() => {
    if (!showChatViewer) {
      setSelectedDocumentId(null);
    }
  }, [showChatViewer]);

  return (
    <>
      <Sidebar />
      <Flexbox horizontal className={styles.mainContainer} flex={1} height={'100%'}>
        <Flexbox flex={1} height={'100%'} style={{ minWidth: 0 }}>
          <Outlet />
        </Flexbox>
        {showChatViewer && (
          <ViewerPanel
            selectedDocumentId={selectedDocumentId}
            onClose={() => setSelectedDocumentId(null)}
          />
        )}
        <AgentWorkspaceRightPanel
          selectedDocumentId={showChatViewer ? selectedDocumentId : null}
          onSelectDocument={showChatViewer ? setSelectedDocumentId : noopSelectDocument}
        />
      </Flexbox>
      <RegisterHotkeys />
      {isDesktop && <ProtocolUrlHandler />}
      <AgentIdSync />
    </>
  );
};

export default Layout;
