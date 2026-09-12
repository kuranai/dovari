import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';

import {
  createPageRequestSchema,
  deletePageRequestSchema,
  MAX_PAGE_REQUEST_BYTES,
  pageIdSchema,
  updatePageContentRequestSchema,
  updatePageRequestSchema,
} from '../../shared/pages';
import { apiError } from '../middleware/security';
import type { WorkerApp } from '../types';
import { PageError } from './errors';
import { PageRepository } from './repository';
import { PageService } from './service';

function validationDetails(error: z.ZodError) {
  return {
    issues: error.issues.slice(0, 8).map((issue) => ({
      message: issue.message,
      path: issue.path.join('.'),
    })),
  };
}

function requestBodyTooLarge(context: Context<WorkerApp>) {
  const contentLength = context.req.header('Content-Length');
  if (contentLength === undefined) {
    return false;
  }

  const bytes = Number(contentLength);
  return Number.isFinite(bytes) && bytes > MAX_PAGE_REQUEST_BYTES;
}

async function parseJsonBody<T>(
  context: Context<WorkerApp>,
  schema: z.ZodType<T>,
  invalidCode: 'INVALID_REQUEST' | 'INVALID_DOCUMENT' = 'INVALID_REQUEST',
) {
  if (requestBodyTooLarge(context)) {
    throw new PageError(
      413,
      'PAGE_TOO_LARGE',
      'This page is too large. Split it into smaller pages.',
    );
  }

  let payload: unknown;
  try {
    const body = await context.req.text();
    if (new TextEncoder().encode(body).byteLength > MAX_PAGE_REQUEST_BYTES) {
      throw new PageError(
        413,
        'PAGE_TOO_LARGE',
        'This page is too large. Split it into smaller pages.',
      );
    }
    payload = JSON.parse(body) as unknown;
  } catch (error) {
    if (error instanceof PageError) {
      throw error;
    }
    throw new PageError(400, 'INVALID_REQUEST', 'The request body must be valid JSON.');
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const isDocumentIssue =
      invalidCode === 'INVALID_DOCUMENT' &&
      typeof payload === 'object' &&
      payload !== null &&
      'content' in payload &&
      parsed.error.issues.some((issue) => issue.path[0] === 'content');
    throw new PageError(
      isDocumentIssue ? 422 : 400,
      isDocumentIssue ? 'INVALID_DOCUMENT' : 'INVALID_REQUEST',
      isDocumentIssue ? 'The page content is invalid.' : 'The request body is invalid.',
      validationDetails(parsed.error),
    );
  }

  return parsed.data;
}

async function parseOptionalDeleteBody(context: Context<WorkerApp>) {
  if (!context.req.raw.body || context.req.header('Content-Length') === '0') {
    return undefined;
  }

  return parseJsonBody(context, deletePageRequestSchema);
}

function pageId(context: Context<WorkerApp>) {
  const id = context.req.param('id');
  const parsed = pageIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new PageError(400, 'INVALID_REQUEST', 'The page id is invalid.');
  }
  return parsed.data;
}

async function withPageErrors(
  context: Context<WorkerApp>,
  operation: (service: PageService) => Promise<Response>,
) {
  try {
    return await operation(new PageService(new PageRepository(context.env.DB)));
  } catch (error) {
    if (error instanceof PageError) {
      return apiError(context, error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

export function registerPageRoutes(app: Hono<WorkerApp>) {
  app.get('/api/private/pages', (context) =>
    withPageErrors(context, async (service) => context.json({ pages: await service.list() })),
  );

  app.post('/api/private/pages', (context) =>
    withPageErrors(context, async (service) => {
      const input = await parseJsonBody(context, createPageRequestSchema);
      const page = await service.create(input);
      return context.json({ page }, 201);
    }),
  );

  app.get('/api/private/pages/:id', (context) =>
    withPageErrors(context, async (service) => {
      const page = await service.get(pageId(context));
      return context.json({ page });
    }),
  );

  app.patch('/api/private/pages/:id', (context) =>
    withPageErrors(context, async (service) => {
      const input = await parseJsonBody(context, updatePageRequestSchema);
      const page = await service.updateMetadata(pageId(context), input);
      return context.json({ page });
    }),
  );

  app.put('/api/private/pages/:id/content', (context) =>
    withPageErrors(context, async (service) => {
      const input = await parseJsonBody(
        context,
        updatePageContentRequestSchema,
        'INVALID_DOCUMENT',
      );
      const page = await service.updateContent(pageId(context), input);
      return context.json({ page });
    }),
  );

  app.delete('/api/private/pages/:id', (context) =>
    withPageErrors(context, async (service) => {
      const input = await parseOptionalDeleteBody(context);
      const page = await service.delete(pageId(context), input);
      return context.json({ page });
    }),
  );
}
