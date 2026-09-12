import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PageDetail, PageSummary } from '../../shared/pages';
import { App } from './App';

const pageId = '11111111-1111-4111-8111-111111111111';

function createPage(overrides: Partial<PageDetail> = {}): PageDetail {
  return {
    content: { content: [], type: 'doc' },
    contentText: '',
    createdAt: '2026-09-12T00:00:00.000Z',
    deletedAt: null,
    id: pageId,
    parentId: null,
    position: 0,
    revision: 1,
    slug: 'untitled',
    title: 'Untitled',
    updatedAt: '2026-09-12T00:00:00.000Z',
    ...overrides,
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

describe('Dovari app shell', () => {
  it('renders an empty workspace and offers a first page', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ pages: [] }));

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Start with one useful page.' }),
    ).toBeTruthy();
    expect(screen.getByText('No pages yet.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'New page ⌘N' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates, renames, and deletes a page without leaving the app shell', async () => {
    let page = createPage();
    let pages: PageSummary[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/private/pages' && method === 'GET') {
        return response({ pages });
      }

      if (url === '/api/private/pages' && method === 'POST') {
        pages = [page];
        return response({ page }, 201);
      }

      if (url === `/api/private/pages/${pageId}` && method === 'GET') {
        return response({ page });
      }

      if (url === `/api/private/pages/${pageId}` && method === 'PATCH') {
        page = createPage({
          ...page,
          revision: page.revision + 1,
          slug: 'renamed-page',
          title: 'Renamed page',
          updatedAt: '2026-09-12T00:00:01.000Z',
        });
        pages = [page];
        return response({ page });
      }

      if (url === `/api/private/pages/${pageId}` && method === 'DELETE') {
        page = createPage({ ...page, deletedAt: '2026-09-12T00:00:02.000Z', revision: 3 });
        pages = [];
        return response({ page });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    render(<App />);

    await screen.findByRole('button', { name: 'New page ⌘N' });
    fireEvent.click(screen.getByRole('button', { name: 'New page ⌘N' }));

    expect(await screen.findByRole('heading', { name: 'Untitled' })).toBeTruthy();
    expect(window.location.pathname).toBe(`/app/pages/${pageId}`);
    expect(screen.getByRole('link', { name: 'Untitled' }).getAttribute('href')).toBe(
      `/app/pages/${pageId}`,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename page' }));
    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'Renamed page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }));

    expect(await screen.findByRole('heading', { name: 'Renamed page' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Renamed page' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }));

    expect(
      await screen.findByRole('heading', { name: 'Start with one useful page.' }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Renamed page' })).toBeNull();
    expect(window.location.pathname).toBe('/app');
    expect(fetchMock.mock.calls.map((call) => call[1]?.method ?? 'GET')).toEqual(
      expect.arrayContaining(['GET', 'POST', 'GET', 'PATCH', 'DELETE']),
    );
  });

  it('shows a retryable error when the page list cannot be loaded', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: 'HEALTH_UNAVAILABLE',
              message: 'Service unavailable.',
            },
            requestId: 'test-request',
          },
          503,
        ),
      )
      .mockResolvedValueOnce(response({ pages: [] }));

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'We couldn’t load your pages.' }),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    expect(
      await screen.findByRole('heading', { name: 'Start with one useful page.' }),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
