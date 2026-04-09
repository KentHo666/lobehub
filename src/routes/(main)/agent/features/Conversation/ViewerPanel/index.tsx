import { memo } from 'react';

import AgentDocumentSidePanel from '../AgentDocumentSidePanel';

interface ViewerPanelProps {
  onClose: () => void;
  selectedDocumentId: string | null;
}

const ViewerPanel = memo<ViewerPanelProps>(({ selectedDocumentId, onClose }) => {
  return <AgentDocumentSidePanel selectedDocumentId={selectedDocumentId} onClose={onClose} />;
});

ViewerPanel.displayName = 'ViewerPanel';

export default ViewerPanel;
