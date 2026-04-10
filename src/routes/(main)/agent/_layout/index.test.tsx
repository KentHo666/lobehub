/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Layout from './index';

const mockAgentStoreState = vi.hoisted(() => ({ activeAgentId: 'agent-1' }));
const mockLocation = vi.hoisted(() => ({ pathname: '/agent/agent-1' }));

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('react-router-dom', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await vi.importActual('react-router-dom')) as typeof import('react-router-dom');

  return {
    ...actual,
    Outlet: () => <div data-testid="agent-layout-outlet">outlet</div>,
    useLocation: () => mockLocation,
  };
});

vi.mock('@/const/version', () => ({ isDesktop: false }));
vi.mock('@/hooks/useInitAgentConfig', () => ({ useInitAgentConfig: vi.fn() }));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: typeof mockAgentStoreState) => unknown) =>
    selector(mockAgentStoreState),
}));
vi.mock('@/features/ProtocolUrlHandler', () => ({ default: () => null }));
vi.mock('./RegisterHotkeys', () => ({ default: () => null }));
vi.mock('./Sidebar', () => ({ default: () => <div data-testid="agent-layout-sidebar" /> }));
vi.mock('./AgentIdSync', () => ({ default: () => null }));
vi.mock('@/routes/(main)/agent/features/Conversation/ViewerPanel', () => ({
  default: ({
    onClose,
    selectedDocumentId,
  }: {
    onClose: () => void;
    selectedDocumentId: string | null;
  }) => (
    <div data-testid="agent-layout-viewer">
      <span data-testid="agent-layout-viewer-value">{selectedDocumentId ?? 'none'}</span>
      <button onClick={onClose}>close document</button>
    </div>
  ),
}));
vi.mock('@/routes/(main)/agent/features/Conversation/RightPanel', () => ({
  default: ({
    onSelectDocument,
    selectedDocumentId,
  }: {
    onSelectDocument: (id: string | null) => void;
    selectedDocumentId: string | null;
  }) => (
    <div data-testid="agent-layout-right-panel">
      <span data-testid="agent-layout-right-panel-value">{selectedDocumentId ?? 'none'}</span>
      <button onClick={() => onSelectDocument('doc-1')}>select document</button>
    </div>
  ),
}));

describe('Agent layout workspace panel ownership', () => {
  beforeEach(() => {
    mockAgentStoreState.activeAgentId = 'agent-1';
    mockLocation.pathname = '/agent/agent-1';
  });

  it('renders the outlet and keeps the workspace panel mounted at layout level', () => {
    render(<Layout />);

    expect(screen.getByTestId('agent-layout-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('agent-layout-outlet')).toBeInTheDocument();
    expect(screen.getByTestId('agent-layout-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('agent-layout-right-panel')).toBeInTheDocument();
  });

  it('stores document selection in layout state and clears it when the active agent changes', () => {
    const { rerender } = render(<Layout />);

    fireEvent.click(screen.getByText('select document'));

    expect(screen.getByTestId('agent-layout-viewer-value')).toHaveTextContent('doc-1');
    expect(screen.getByTestId('agent-layout-right-panel-value')).toHaveTextContent('doc-1');

    mockAgentStoreState.activeAgentId = 'agent-2';
    rerender(<Layout />);

    expect(screen.getByTestId('agent-layout-viewer-value')).toHaveTextContent('none');
    expect(screen.getByTestId('agent-layout-right-panel-value')).toHaveTextContent('none');
  });

  it('keeps the right panel on topic /page but hides chat-only viewer state', () => {
    const { rerender } = render(<Layout />);

    fireEvent.click(screen.getByText('select document'));
    expect(screen.getByTestId('agent-layout-viewer-value')).toHaveTextContent('doc-1');

    mockLocation.pathname = '/agent/agent-1/tpc_topic-1/page';
    rerender(<Layout />);

    expect(screen.queryByTestId('agent-layout-viewer')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-layout-right-panel')).toBeInTheDocument();
    expect(screen.getByTestId('agent-layout-right-panel-value')).toHaveTextContent('none');
  });
});
