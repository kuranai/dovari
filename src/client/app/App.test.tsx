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

function pageSummary(page: PageDetail): PageSummary {
  return {
    id: page.id,
    parentId: page.parentId,
    position: page.position,
    revision: page.revision,
    slug: page.slug,
    title: page.title,
    updatedAt: page.updatedAt,
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

  it('creates children, collapses branches, renames inline, and offers keyboard moving', async () => {
    const rootId = '22222222-2222-4222-8222-222222222222';
    const siblingId = '33333333-3333-4333-8333-333333333333';
    const childId = '44444444-4444-4444-8444-444444444444';
    const createdId = '55555555-5555-4555-8555-555555555555';
    let root = createPage({ id: rootId, slug: 'root', title: 'Root' });
    let sibling = createPage({ id: siblingId, position: 1, slug: 'sibling', title: 'Sibling' });
    const child = createPage({
      id: childId,
      parentId: rootId,
      position: 0,
      slug: 'child',
      title: 'Child',
    });
    let pages: PageSummary[] = [pageSummary(root), pageSummary(sibling), pageSummary(child)];
    const pageStore = new Map<string, PageDetail>([
      [root.id, root],
      [sibling.id, sibling],
      [child.id, child],
    ]);
    const created = createPage({
      id: createdId,
      parentId: rootId,
      position: 1,
      slug: 'untitled-2',
      title: 'Untitled',
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));

      if (url === '/api/private/pages' && method === 'GET') {
        return response({ pages });
      }

      if (url === '/api/private/pages' && method === 'POST') {
        pageStore.set(created.id, created);
        pages = [...pages, pageSummary(created)];
        return response({ page: created }, 201);
      }

      const pageIdMatch = url.match(/^\/api\/private\/pages\/([^/]+)$/);
      if (pageIdMatch && method === 'GET') {
        const page = pageStore.get(pageIdMatch[1]);
        if (!page) {
          throw new Error(`Unknown page ${pageIdMatch[1]}`);
        }
        return response({ page });
      }

      if (pageIdMatch && method === 'PATCH') {
        const current = pageStore.get(pageIdMatch[1]);
        if (!current) {
          throw new Error(`Unknown page ${pageIdMatch[1]}`);
        }
        root = createPage({
          ...current,
          revision: current.revision + 1,
          slug: 'renamed-root',
          title: body.title,
          updatedAt: '2026-09-12T00:00:01.000Z',
        });
        pageStore.set(root.id, root);
        pages = pages.map((page) => (page.id === root.id ? pageSummary(root) : page));
        return response({ page: root });
      }

      const moveMatch = url.match(/^\/api\/private\/pages\/([^/]+)\/move$/);
      if (moveMatch && method === 'POST') {
        sibling = createPage({
          ...sibling,
          position: 0,
          revision: sibling.revision + 1,
          updatedAt: '2026-09-12T00:00:02.000Z',
        });
        root = createPage({ ...root, position: 1 });
        pageStore.set(sibling.id, sibling);
        pageStore.set(root.id, root);
        pages = pages.map((page) => {
          if (page.id === sibling.id) {
            return pageSummary(sibling);
          }
          if (page.id === root.id) {
            return pageSummary(root);
          }
          return page;
        });
        return response({ page: sibling });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    render(<App />);

    expect(await screen.findByRole('link', { name: 'Root' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Root' }));
    expect(screen.queryByRole('link', { name: 'Child' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Root' }));
    expect(screen.getByRole('link', { name: 'Child' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create child of Root' }));
    expect(await screen.findByRole('heading', { name: 'Untitled' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Root' }));
    fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'Renamed root' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }));
    expect(await screen.findByRole('link', { name: 'Renamed root' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Move Sibling' }));
    fireEvent.change(screen.getByLabelText('Position'), {
      target: { value: `before:${rootId}` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move page' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([requestUrl, requestInit]) =>
            String(requestUrl) === `/api/private/pages/${siblingId}/move` &&
            requestInit?.method === 'POST',
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole('link', { name: 'Sibling' })).toBeTruthy());
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
