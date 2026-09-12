/// <reference types="@cloudflare/vitest-plugin/types" />

import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { MAX_PAGE_ROW_BYTES, type PageDetail, type TiptapDocument } from '../../shared/pages';
import { app } from '../index';
import type { WorkerBindings } from '../types';

const testEnv = env as typeof env & { DOVARI_TEST_D1_MIGRATIONS: string };
const localEnv = { ...env, DOVARI_ENV: 'local' } as unknown as WorkerBindings;
const createdPageIds = new Set<string>();

beforeAll(async () => {
  const migrations = JSON.parse(testEnv.DOVARI_TEST_D1_MIGRATIONS) as Array<{
    name: string;
    queries: string[];
  }>;

  await applyD1Migrations(env.DB, migrations);
});

afterEach(async () => {
  for (const pageId of createdPageIds) {
    await env.DB.prepare('DELETE FROM page_links WHERE source_page_id = ? OR target_page_id = ?')
      .bind(pageId, pageId)
      .run();
    await env.DB.prepare('DELETE FROM page_assets WHERE page_id = ?').bind(pageId).run();
    await env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(pageId).run();
  }

  createdPageIds.clear();
});

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.method !== undefined && !['GET', 'HEAD'].includes(init.method.toUpperCase())) {
    headers.set('Origin', 'http://localhost');
  }

  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), localEnv);
}

async function createPage(title: string, parentId: string | null = null) {
  const response = await request('/api/private/pages', {
    body: JSON.stringify({ parentId, title }),
    method: 'POST',
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { page: PageDetail };
  createdPageIds.add(body.page.id);
  return body.page;
}

describe('Pages HTTP API', () => {
  it('supports list, create, detail, metadata update, content update, and soft delete', async () => {
    const created = await createPage('Getting Started');

    expect(created).toMatchObject({
      content: { content: [], type: 'doc' },
      contentText: '',
      position: 0,
      revision: 1,
      slug: 'getting-started',
      title: 'Getting Started',
    });

    const listResponse = await request('/api/private/pages');
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as { pages: Array<Record<string, unknown>> };
    expect(list.pages).toHaveLength(1);
    expect(list.pages[0]).toEqual({
      id: created.id,
      parentId: null,
      position: 0,
      revision: 1,
      slug: 'getting-started',
      title: 'Getting Started',
      updatedAt: created.updatedAt,
    });
    expect(list.pages[0]).not.toHaveProperty('content');

    const detailResponse = await request(`/api/private/pages/${created.id}`);
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      page: { id: created.id, contentText: '', revision: 1 },
    });

    const renameResponse = await request(`/api/private/pages/${created.id}`, {
      body: JSON.stringify({ baseRevision: 1, title: 'Renamed Page' }),
      method: 'PATCH',
    });
    expect(renameResponse.status).toBe(200);
    const renamed = (await renameResponse.json()) as { page: PageDetail };
    expect(renamed.page).toMatchObject({
      revision: 2,
      slug: 'renamed-page',
      title: 'Renamed Page',
    });

    const content: TiptapDocument = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello' }] },
        {
          type: 'paragraph',
          content: [{ marks: [{ type: 'bold' }], text: 'world', type: 'text' }],
        },
      ],
    };
    const contentResponse = await request(`/api/private/pages/${created.id}/content`, {
      body: JSON.stringify({ baseRevision: 2, content }),
      method: 'PUT',
    });
    expect(contentResponse.status).toBe(200);
    const updated = (await contentResponse.json()) as { page: PageDetail };
    expect(updated.page).toMatchObject({
      content,
      contentText: 'Hello\nworld',
      revision: 3,
    });

    const deleteResponse = await request(`/api/private/pages/${created.id}`, {
      body: JSON.stringify({ baseRevision: 3 }),
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);
    const deleted = (await deleteResponse.json()) as { page: PageDetail };
    expect(deleted.page.deletedAt).toEqual(expect.any(String));
    expect(deleted.page.revision).toBe(4);

    expect((await request(`/api/private/pages/${created.id}`)).status).toBe(404);
    const afterDelete = (await (await request('/api/private/pages')).json()) as {
      pages: Array<{ id: string }>;
    };
    expect(afterDelete.pages).toEqual([]);
  });

  it('generates unique slugs and positions children after their siblings', async () => {
    const parent = await createPage('Project Notes');
    const duplicate = await createPage('Project Notes');
    const child = await createPage('First Child', parent.id);

    expect(duplicate.slug).toBe('project-notes-2');
    expect(child).toMatchObject({ parentId: parent.id, position: 0 });

    const list = (await (await request('/api/private/pages')).json()) as {
      pages: PageDetail[];
    };
    expect(list.pages.map((page) => page.id)).toEqual([parent.id, duplicate.id, child.id]);
  });

  it('rejects stale writes without overwriting the current page', async () => {
    const page = await createPage('Conflict Test');
    const content: TiptapDocument = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ text: 'new value', type: 'text' }] }],
    };

    const firstWrite = await request(`/api/private/pages/${page.id}/content`, {
      body: JSON.stringify({ baseRevision: page.revision, content }),
      method: 'PUT',
    });
    expect(firstWrite.status).toBe(200);

    const staleWrite = await request(`/api/private/pages/${page.id}`, {
      body: JSON.stringify({ baseRevision: page.revision, title: 'Stale title' }),
      method: 'PATCH',
    });
    expect(staleWrite.status).toBe(409);
    await expect(staleWrite.json()).resolves.toMatchObject({
      error: {
        code: 'PAGE_CONFLICT',
        details: { currentRevision: 2 },
      },
    });

    const detail = (await (await request(`/api/private/pages/${page.id}`)).json()) as {
      page: PageDetail;
    };
    expect(detail.page).toMatchObject({
      contentText: 'new value',
      revision: 2,
      title: 'Conflict Test',
    });
  });

  it('rejects invalid documents and rows that exceed the D1 safety limit', async () => {
    const page = await createPage('Validation Test');

    const invalidDocument = await request(`/api/private/pages/${page.id}/content`, {
      body: JSON.stringify({
        baseRevision: page.revision,
        content: {
          content: [{ type: 'html', content: [], attrs: { html: '<script>' } }],
          type: 'doc',
        },
      }),
      method: 'PUT',
    });
    expect(invalidDocument.status).toBe(422);
    await expect(invalidDocument.json()).resolves.toMatchObject({
      error: { code: 'INVALID_DOCUMENT' },
    });

    const invalidRequest = await request(`/api/private/pages/${page.id}/content`, {
      body: JSON.stringify({ baseRevision: '1', content: { content: [], type: 'doc' } }),
      method: 'PUT',
    });
    expect(invalidRequest.status).toBe(400);
    await expect(invalidRequest.json()).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    });

    const tooLarge = await request(`/api/private/pages/${page.id}/content`, {
      body: JSON.stringify({
        baseRevision: page.revision,
        content: {
          content: [
            {
              content: [{ text: 'x'.repeat(MAX_PAGE_ROW_BYTES), type: 'text' }],
              type: 'paragraph',
            },
          ],
          type: 'doc',
        },
      }),
      method: 'PUT',
    });
    expect(tooLarge.status).toBe(413);
    await expect(tooLarge.json()).resolves.toMatchObject({
      error: { code: 'PAGE_TOO_LARGE' },
    });
  });
});
