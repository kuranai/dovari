import type { Context, MiddlewareHandler } from 'hono';

import { authorizeAccessRequest, isLocalAuthBypassRequest } from '../auth/access';
import { classifyPath } from '../routing';
import type { WorkerApp } from '../types';

export type ApiErrorStatus = 401 | 403 | 404 | 500 | 503;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
].join('; ');

const LOCAL_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY.replace(
  "style-src 'self'",
  "style-src 'self' 'unsafe-inline'",
);

function createRequestId() {
  return crypto.randomUUID();
}

function requestIdFrom(request: Request) {
  const provided = request.headers.get('X-Request-ID')?.trim();
  if (provided && provided.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(provided)) {
    return provided;
  }

  return createRequestId();
}

function isMutationMethod(method: string) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('Origin');
  if (!origin) {
    return false;
  }

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function replaceResponseHeaders(context: Context<WorkerApp>, additionalHeaders: HeadersInit) {
  const response = context.res;
  const headers = new Headers(response.headers);

  new Headers(additionalHeaders).forEach((value, name) => {
    headers.set(name, value);
  });

  context.res = new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function securityHeadersFor(context: Context<WorkerApp>) {
  const headers: Record<string, string> = {
    'Content-Security-Policy': isLocalAuthBypassRequest(context.req.raw, context.env)
      ? LOCAL_CONTENT_SECURITY_POLICY
      : CONTENT_SECURITY_POLICY,
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };

  if (new URL(context.req.url).protocol === 'https:') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  return headers;
}

export function apiError(
  context: Context<WorkerApp>,
  status: ApiErrorStatus,
  code: string,
  message: string,
) {
  const requestId = context.get('requestId');
  context.header('Cache-Control', 'no-store');
  return context.json({ error: { code, message }, requestId }, status);
}

export const requestIdMiddleware: MiddlewareHandler<WorkerApp> = async (context, next) => {
  const requestId = requestIdFrom(context.req.raw);
  context.set('requestId', requestId);
  context.header('X-Request-ID', requestId);
  await next();
  replaceResponseHeaders(context, { 'X-Request-ID': requestId });
};

export const securityHeadersMiddleware: MiddlewareHandler<WorkerApp> = async (context, next) => {
  const securityHeaders = securityHeadersFor(context);
  for (const [name, value] of Object.entries(securityHeaders)) {
    context.header(name, value);
  }

  await next();
  replaceResponseHeaders(context, securityHeaders);
};

export const accessMiddleware: MiddlewareHandler<WorkerApp> = async (context, next) => {
  const pathname = new URL(context.req.url).pathname;
  const classification = classifyPath(pathname);

  if (classification.kind !== 'private') {
    await next();
    return;
  }

  const authorization = await authorizeAccessRequest(context.req.raw, context.env);
  if (!authorization.ok) {
    if (authorization.code === 'AUTH_REQUIRED' || authorization.code === 'AUTH_INVALID') {
      context.header('WWW-Authenticate', 'Bearer');
    }

    return apiError(context, authorization.status, authorization.code, authorization.message);
  }

  context.set('identity', authorization.identity);

  if (
    classification.area === 'api' &&
    isMutationMethod(context.req.method) &&
    !isSameOriginRequest(context.req.raw)
  ) {
    return apiError(context, 403, 'ORIGIN_MISMATCH', 'Request origin is not allowed.');
  }

  await next();
};
