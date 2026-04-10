/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NotebookButton from './index';

const navigateMock = vi.hoisted(() => vi.fn());
const toggleNotebookMock = vi.hoisted(() => vi.fn());
const useParamsMock = vi.hoisted(() => vi.fn());

vi.mock('@lobehub/ui', () => ({
  ActionIcon: ({ onClick, title }: { onClick?: () => void; title?: string }) => (
    <button onClick={onClick}>{title}</button>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await vi.importActual('react-router-dom')) as typeof import('react-router-dom');

  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: useParamsMock,
  };
});

vi.mock('@/store/chat', () => ({
  useChatStore: (
    selector: (state: { showNotebook: boolean; toggleNotebook: () => void }) => unknown,
  ) => selector({ showNotebook: false, toggleNotebook: toggleNotebookMock }),
}));

describe('NotebookButton', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toggleNotebookMock.mockReset();
    useParamsMock.mockReset();
  });

  it('navigates to the topic page route when topicId is present', () => {
    useParamsMock.mockReturnValue({ aid: 'agt_test', topicId: 'tpc_test' });

    render(<NotebookButton />);

    fireEvent.click(screen.getByRole('button', { name: 'notebook.title' }));

    expect(navigateMock).toHaveBeenCalledWith('/agent/agt_test/tpc_test/page');
    expect(toggleNotebookMock).not.toHaveBeenCalled();
  });

  it('falls back to the legacy notebook toggle when topicId is missing', () => {
    useParamsMock.mockReturnValue({ aid: 'agt_test' });

    render(<NotebookButton />);

    fireEvent.click(screen.getByRole('button', { name: 'notebook.title' }));

    expect(toggleNotebookMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('falls back to the legacy notebook toggle when aid is missing', () => {
    useParamsMock.mockReturnValue({});

    render(<NotebookButton />);

    fireEvent.click(screen.getByRole('button', { name: 'notebook.title' }));

    expect(toggleNotebookMock).toHaveBeenCalledTimes(1);
  });
});
