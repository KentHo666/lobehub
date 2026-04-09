import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalStore } from '@/store/global';
import { initialState } from '@/store/global/initialState';

import Conversation from '../index';
import AgentWorkspaceRightPanel from './index';

const useClientDataSWR = vi.fn();

let mockAgentMeta: { avatar?: string; title?: string } = {
  avatar: 'agent-avatar',
  title: 'Test Agent',
};

vi.mock('@lobehub/ui', () => ({
  Accordion: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  AccordionItem: ({
    children,
    title,
    ...props
  }: {
    children?: ReactNode;
    title?: ReactNode;
    [key: string]: unknown;
  }) => (
    <div {...props}>
      {title}
      {children}
    </div>
  ),
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
  Checkbox: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  DraggablePanel: ({ children, expand }: { children?: ReactNode; expand?: boolean }) => (
    <div data-expand={String(expand)} data-testid="right-panel">
      {children}
    </div>
  ),
  Avatar: ({ avatar }: { avatar?: ReactNode | string }) => <div>{avatar}</div>,
  Flexbox: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  Icon: () => <div />,
  Markdown: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Progress: () => <div data-testid="workspace-progress-bar" />,
  Tag: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TextArea: () => <textarea />,
  TooltipGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'untitledAgent': 'Localized Untitled Agent',
          'agentWorkspace.agentDocuments': 'Agent Documents',
          'agentWorkspace.progress': 'Progress',
          'agentWorkspace.progress.allCompleted': 'All tasks completed',
          'agentWorkspace.resources': 'Resources',
          'agentWorkspace.resources.empty': 'No agent documents yet',
        }) as Record<string, string>
      )[key] || key,
  }),
}));

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: (...args: unknown[]) => useClientDataSWR(...args),
}));

vi.mock('@/components/DragUploadZone', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useUploadFiles: () => ({ handleUploadFiles: vi.fn() }),
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: Record<string, unknown>) => unknown) => selector?.({}),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    currentAgentMeta: () => mockAgentMeta,
    currentAgentModel: () => 'mock-model',
    currentAgentModelProvider: () => 'mock-provider',
  },
}));

vi.mock('@/features/Conversation/store', () => ({
  dataSelectors: {
    dbMessages: (state: { dbMessages?: unknown[] }) => state.dbMessages,
  },
  useConversationStore: (selector: (state: { dbMessages: unknown[] }) => unknown) =>
    selector({ dbMessages: [] }),
}));

vi.mock('../ConversationArea', () => ({
  default: () => <div>conversation-area</div>,
}));

vi.mock('../Header', () => ({
  default: () => <div>chat-header</div>,
}));

vi.mock('../ViewerPanel', () => ({
  default: () => null,
}));

beforeEach(() => {
  useClientDataSWR.mockImplementation(() => ({
    data: [],
    error: undefined,
    isLoading: false,
  }));
  mockAgentMeta = {
    avatar: 'agent-avatar',
    title: 'Test Agent',
  };
  useGlobalStore.setState(initialState);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Conversation right panel mount', () => {
  it('mounts the conversation-side right panel path and respects the existing global right-panel state', async () => {
    const { unmount } = render(<Conversation />);

    expect(screen.getByText('chat-header')).toBeInTheDocument();
    expect(screen.getByText('conversation-area')).toBeInTheDocument();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-summary')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-progress')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-resources')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('right-panel')).toHaveAttribute('data-expand', 'true');
      expect(useGlobalStore.getState().status.showRightPanel).toBe(true);
    });

    unmount();

    expect(useGlobalStore.getState().status.showRightPanel).toBe(true);
  });

  it('renders summary, progress, and resources sections in order', () => {
    render(<AgentWorkspaceRightPanel selectedDocumentId={null} onSelectDocument={vi.fn()} />);

    const summary = screen.getByTestId('workspace-summary');
    const progress = screen.getByTestId('workspace-progress');
    const resources = screen.getByTestId('workspace-resources');

    expect(summary).toHaveTextContent('Test Agent');
    expect(summary.compareDocumentPosition(progress)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(progress.compareDocumentPosition(resources)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('uses the localized untitled-agent fallback when the active agent has no title', () => {
    mockAgentMeta = { avatar: 'agent-avatar' };

    render(<AgentWorkspaceRightPanel selectedDocumentId={null} onSelectDocument={vi.fn()} />);

    expect(screen.getByTestId('workspace-summary')).toHaveTextContent('Localized Untitled Agent');
  });
});
