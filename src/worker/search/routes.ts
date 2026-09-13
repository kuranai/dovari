import { Hono } from 'hono';
import type { Context } from 'hono';

import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_RESULTS,
  normalizeSearchQuery,
  type SearchRequest,
} from '../../shared/search';
import { apiError } from '../middleware/security';
import type { WorkerApp } from '../types';
import { SearchError } from './errors';
import { SearchRepository } from './repository';
import { SearchService } from './service';

function parseLimit(value: string | undefined) {
  if (value === undefined) {
    return SEARCH_DEFAULT_LIMIT;
  }

  if (!/^[0-9]+$/u.test(value)) {
    throw new SearchError(400, 'INVALID_REQUEST', 'The search limit must be a positive integer.');
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new SearchError(400, 'INVALID_REQUEST', 'The search limit must be a positive integer.');
  }

  return Math.min(parsed, SEARCH_MAX_RESULTS);
}

function parseSearchRequest(context: Context<WorkerApp>): SearchRequest {
  return {
    query: normalizeSearchQuery(context.req.query('q') ?? ''),
    limit: parseLimit(context.req.query('limit')),
  };
}

async function withSearchErrors(
  context: Context<WorkerApp>,
  operation: (service: SearchService) => Promise<Response>,
) {
  try {
    return await operation(new SearchService(new SearchRepository(context.env.DB)));
  } catch (error) {
    if (error instanceof SearchError) {
      return apiError(context, error.status, error.code, error.message, error.details);
    }
    throw error;
  }
}

export function registerSearchRoutes(app: Hono<WorkerApp>) {
  app.get('/api/private/search', (context) =>
    withSearchErrors(context, async (service) => {
      context.header('Cache-Control', 'no-store');
      const response = await service.search(parseSearchRequest(context));
      return context.json(response);
    }),
  );
}
