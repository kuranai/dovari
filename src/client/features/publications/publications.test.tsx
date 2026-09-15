import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PageDetail } from '../../../shared/pages';
import { PublicationPanel } from './PublicationPanel';
import { PublicLandingPage } from './PublicLandingPage';
import { PublicPage } from './PublicPage';

const publicId = '11111111-1111-4111-8111-111111111111';
const targetPublicId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function page(): PageDetail {
  return {
    content: { content: [], type: 'doc' },
    contentText: '',
    createdAt: '2026-09-14T00:00:00.000Z',
    deletedAt: null,
    id: pageId,
    isFavorite: false,
    parentId: null,
    position: 0,
    revision: 3,
    slug: 'public-page',
    title: 'Public page',
    tags: [],
    updatedAt: '2026-09-14T00:00:03.000Z',
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('public publication UI', () => {
  it('renders the complete public landing list without private page metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        nextCursor: null,
        publications: [
          {
            allowIndexing: false,
            publicId,
            publishedAt: '2026-09-14T00:00:00.000Z',
            publishedTitle: 'Public handbook',
            updatedAt: '2026-09-14T00:00:00.000Z',
          },
        ],
      }),
    );

    render(
      <MemoryRouter initialEntries={['/']}>
        <PublicLandingPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Public handbook' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Public handbook/ }).getAttribute('href')).toBe(
      `/p/${publicId}`,
    );
    expect(screen.queryByText(pageId)).toBeNull();
    expect(screen.getByRole('link', { name: 'Edit privately' }).getAttribute('href')).toBe('/app');
  });

  it('renders a read-only public snapshot and exposes only public links and assets', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/public/publications?')) {
        return response({
          nextCursor: null,
          publications: [
            {
              allowIndexing: false,
              publicId,
              publishedAt: '2026-09-14T00:00:00.000Z',
              publishedTitle: 'Public handbook',
              updatedAt: '2026-09-14T00:00:00.000Z',
            },
          ],
        });
      }
      if (url === `/api/public/publications/${publicId}`) {
        return response({
          publication: {
            allowIndexing: false,
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Read this ' },
                    {
                      type: 'publicWikiLink',
                      attrs: { targetPublicId, targetTitle: 'Next page' },
                    },
                  ],
                },
                { type: 'attachment', attrs: { assetId, filename: 'notes.txt' } },
              ],
            },
            publicId,
            publishedAt: '2026-09-14T00:00:00.000Z',
            publishedTitle: 'Public handbook',
            updatedAt: '2026-09-14T00:00:00.000Z',
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <MemoryRouter initialEntries={[`/p/${publicId}`]}>
        <Routes>
          <Route element={<PublicPage />} path="/p/:publicId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Public handbook' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      `/p/${targetPublicId}`,
    );
    expect(screen.getByRole('link', { name: 'notes.txt' }).getAttribute('href')).toBe(
      `/api/public/publications/${publicId}/assets/${assetId}/content`,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /publish|save|delete/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Edit page' }).getAttribute('href')).toBe(
      `/app/publications/${publicId}/edit`,
    );
  });

  it('shows publication status and publishes the current page revision', async () => {
    const currentPage = page();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `/api/private/pages/${pageId}/publication` && !init?.method) {
        return response({ publication: null });
      }
      if (url === `/api/private/pages/${pageId}/publication` && init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toEqual({
          allowIndexing: true,
          baseRevision: 3,
          tagIds: [],
        });
        return response({
          publication: {
            allowIndexing: true,
            publicId,
            publicUrl: `/p/${publicId}`,
            publishedAt: '2026-09-14T00:00:03.000Z',
            publishedTitle: currentPage.title,
            sourceRevision: 3,
            tags: [],
            updatedAt: '2026-09-14T00:00:03.000Z',
          },
        });
      }
      throw new Error(`Unexpected request: ${String(init?.method)} ${url}`);
    });

    render(
      <MemoryRouter>
        <PublicationPanel page={currentPage} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Not published')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Allow search engine indexing'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish page' }));

    expect(await screen.findByText('Published')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open public page' }).getAttribute('href')).toBe(
      `/p/${publicId}`,
    );
    expect(fetchMock).toHaveBeenCalled();
  });

  it('renders a retryable 404 state for an unpublished public page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(
        { error: { code: 'PUBLICATION_NOT_FOUND', message: 'Publication not found.' } },
        404,
      ),
    );

    render(
      <MemoryRouter initialEntries={[`/p/${publicId}`]}>
        <Routes>
          <Route element={<PublicPage />} path="/p/:publicId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'This public page is gone.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to public pages' })).toBeTruthy();
  });
});
