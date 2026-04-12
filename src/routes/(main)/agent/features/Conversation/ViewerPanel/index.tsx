import { memo } from 'react';

import AgentDocumentEditorPanel from './AgentDocumentEditorPanel';

interface ViewerPanelProps {
  onClose: () => void;
  selectedDocumentId: string | null;
}

const ViewerPanel = memo<ViewerPanelProps>(({ selectedDocumentId, onClose }) => {
  return <AgentDocumentEditorPanel selectedDocumentId={selectedDocumentId} onClose={onClose} />;
});

ViewerPanel.displayName = 'ViewerPanel';

export default ViewerPanel;
