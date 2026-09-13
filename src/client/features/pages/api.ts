import { z } from 'zod';

import {
  createPageRequestSchema,
  movePageRequestSchema,
  pageResponseSchema,
  pageBacklinksResponseSchema,
  pagesListResponseSchema,
  updatePageContentRequestSchema,
  wikiLinkSearchResponseSchema,
  type CreatePageRequest,
  type MovePageRequest,
  type PageBacklinksResponse,
  type PageResponse,
  type PagesListResponse,
  type TiptapDocument,
  type WikiLinkSearchResponse,
} from '../../../shared/pages';

interface ApiErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    requestId?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export class PageApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    requestId?: string,
  ) {
    super(message);
    this.name = 'PageApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

function apiErrorFromResponse(status: number, body: unknown, requestId?: string) {
  const error = isRecord(body) && isRecord(body.error) ? (body as ApiErrorBody).error : undefined;
  const code = typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED';
  const message =
    typeof error?.message === 'string' ? error.message : 'The request could not be completed.';
  const details = isRecord(error?.details) ? error.details : undefined;
  const responseRequestId = typeof error?.requestId === 'string' ? error.requestId : requestId;

  return new PageApiError(status, code, message, details, responseRequestId);
}

export async function request<T>(
  input: RequestInfo | URL,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, { ...init, headers });
  const bodyText = await response.text();
  const body = parseJson(bodyText);

  if (!response.ok) {
    throw apiErrorFromResponse(
      response.status,
      body,
      response.headers.get('X-Request-ID') ?? undefined,
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new PageApiError(500, 'INVALID_RESPONSE', 'The server returned an invalid response.');
  }

  return parsed.data;
}

export function fetchPages(signal?: AbortSignal) {
  return request<PagesListResponse>('/api/private/pages', pagesListResponseSchema, { signal });
}

export function searchWikiLinkPages(query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query, limit: '8' });
  return request<WikiLinkSearchResponse>(
    `/api/private/wiki-links?${params.toString()}`,
    wikiLinkSearchResponseSchema,
    { signal },
  );
}

export function fetchBacklinks(id: string, signal?: AbortSignal) {
  return request<PageBacklinksResponse>(
    `/api/private/pages/${encodeURIComponent(id)}/backlinks`,
    pageBacklinksResponseSchema,
    { signal },
  );
}

export function fetchPage(id: string, signal?: AbortSignal) {
  return request<PageResponse>(`/api/private/pages/${encodeURIComponent(id)}`, pageResponseSchema, {
    signal,
  });
}

export function createPage(input: CreatePageRequest = { parentId: null, title: 'Untitled' }) {
  const parsed = createPageRequestSchema.parse(input);
  return request<PageResponse>('/api/private/pages', pageResponseSchema, {
    body: JSON.stringify(parsed),
    method: 'POST',
  });
}

export function updatePageTitle(id: string, baseRevision: number, title: string) {
  return request<PageResponse>(`/api/private/pages/${encodeURIComponent(id)}`, pageResponseSchema, {
    body: JSON.stringify({ baseRevision, title }),
    method: 'PATCH',
  });
}

export function updatePageContent(id: string, baseRevision: number, content: TiptapDocument) {
  const parsed = updatePageContentRequestSchema.parse({ baseRevision, content });
  return request<PageResponse>(
    `/api/private/pages/${encodeURIComponent(id)}/content`,
    pageResponseSchema,
    {
      body: JSON.stringify(parsed),
      method: 'PUT',
    },
  );
}

export function deletePage(id: string, baseRevision: number) {
  return request<PageResponse>(`/api/private/pages/${encodeURIComponent(id)}`, pageResponseSchema, {
    body: JSON.stringify({ baseRevision }),
    method: 'DELETE',
  });
}

export function movePage(id: string, input: MovePageRequest) {
  const parsed = movePageRequestSchema.parse(input);
  return request<PageResponse>(
    `/api/private/pages/${encodeURIComponent(id)}/move`,
    pageResponseSchema,
    {
      body: JSON.stringify(parsed),
      method: 'POST',
    },
  );
}

export function pageErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof PageApiError)) {
    if (error instanceof TypeError) {
      return 'Dovari could not reach the server. Check your connection and try again.';
    }
    return fallback;
  }

  switch (error.code) {
    case 'AUTH_REQUIRED':
    case 'AUTH_INVALID':
      return 'Your Dovari session is not available. Sign in again and retry.';
    case 'PAGE_CONFLICT':
      return 'This page changed elsewhere. Reload it before trying again.';
    case 'PAGE_NOT_FOUND':
      return 'This page no longer exists.';
    case 'SLUG_CONFLICT':
      return 'That page name is already in use. Choose another name.';
    case 'PAGE_CYCLE':
      return 'A page cannot be moved into itself or one of its child pages.';
    case 'PARENT_NOT_FOUND':
      return 'The selected parent page no longer exists.';
    case 'MOVE_TARGET_NOT_FOUND':
    case 'MOVE_TARGET_INVALID':
      return 'That move target is no longer available. Refresh the page tree and try again.';
    default:
      return error.message || fallback;
  }
}
