/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import AgentPage from './index';

const useParamsMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await vi.importActual('react-router-dom')) as typeof import('react-router-dom');

  return {
    ...actual,
    useParams: useParamsMock,
  };
});

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('@/features/FloatingChatPanel', () => ({
  default: ({
    agentId,
    open,
    title,
    topicId,
    variant,
  }: {
    agentId: string;
    open?: boolean;
    title?: string;
    topicId: string | null;
    variant?: string;
  }) => (
    <div
      data-agent-id={agentId}
      data-open={String(open)}
      data-testid="floating-chat-panel"
      data-title={title ?? ''}
      data-topic-id={topicId ?? 'null'}
      data-variant={variant ?? ''}
    />
  ),
}));

describe('Agent page route', () => {
  it('renders FloatingChatPanel with visible test props', () => {
    useParamsMock.mockReturnValue({ aid: 'agt_test' });

    render(<AgentPage />);

    expect(screen.getByTestId('agent-page-container')).toBeInTheDocument();
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute('data-agent-id', 'agt_test');
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute(
      'data-title',
      'Floating Chat Panel',
    );
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute('data-topic-id', 'null');
    expect(screen.getByTestId('floating-chat-panel')).toHaveAttribute('data-variant', 'embedded');
  });

  it('returns null when aid is missing', () => {
    useParamsMock.mockReturnValue({});

    const { container } = render(<AgentPage />);

    expect(container).toBeEmptyDOMElement();
  });
});
