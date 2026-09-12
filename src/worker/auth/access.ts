const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion';
const JWKS_PATH = '/cdn-cgi/access/certs';
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ACCESS_TOKEN_LENGTH = 16 * 1024;

export interface AccessClaims {
  [claim: string]: unknown;
}

export type AccessIdentity =
  { kind: 'access'; claims: AccessClaims } | { kind: 'local'; subject: 'local-development' };

export type AccessAuthorizationFailure =
  | {
      code: 'SETUP_REQUIRED';
      message: 'Authentication is not configured.';
      status: 503;
    }
  | {
      code: 'AUTH_REQUIRED';
      message: 'Authentication is required.';
      status: 401;
    }
  | {
      code: 'AUTH_INVALID';
      message: 'Authentication token is invalid.';
      status: 401;
    };

export type AccessAuthorizationResult =
  { ok: true; identity: AccessIdentity } | ({ ok: false } & AccessAuthorizationFailure);

interface AccessEnvironment {
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  DOVARI_ENV?: string;
}

interface AccessConfiguration {
  audience: string;
  issuer: string;
  jwksUrl: string;
}

interface AccessJwk extends JsonWebKey {
  alg?: string;
  kid?: string;
  kty?: string;
  use?: string;
}

interface CachedJwks {
  expiresAt: number;
  keys: AccessJwk[];
}

const jwksCache = new Map<string, CachedJwks>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIssuer(value: string | undefined) {
  if (!value) {
    return null;
  }

  const candidate = value.trim();
  if (!candidate) {
    return null;
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;

  try {
    const url = new URL(withProtocol);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      (url.pathname !== '' && url.pathname !== '/')
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function getAccessConfiguration(env: AccessEnvironment): AccessConfiguration | null {
  const issuer = normalizeIssuer(env.ACCESS_TEAM_DOMAIN);
  const audience = env.ACCESS_AUD?.trim();

  if (!issuer || !audience) {
    return null;
  }

  return {
    audience,
    issuer,
    jwksUrl: `${issuer}${JWKS_PATH}`,
  };
}

function isLoopbackHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1'
  );
}

export function isLocalAuthBypassRequest(request: Request, env: AccessEnvironment) {
  if (env.DOVARI_ENV !== 'local') {
    return false;
  }

  try {
    return isLoopbackHostname(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

function decodeBase64Url(value: string) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid base64url value.');
  }

  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + padding;
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart(value: string) {
  const bytes = decodeBase64Url(value);
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(json);

  if (!isRecord(parsed)) {
    throw new Error('JWT part is not an object.');
  }

  return parsed;
}

function hasAudience(claim: unknown, expectedAudience: string) {
  if (typeof claim === 'string') {
    return claim === expectedAudience;
  }

  return Array.isArray(claim) && claim.some((value) => value === expectedAudience);
}

function validateClaims(payload: Record<string, unknown>, configuration: AccessConfiguration) {
  const now = Date.now() / 1000;

  if (
    payload.iss !== configuration.issuer ||
    !hasAudience(payload.aud, configuration.audience) ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now
  ) {
    throw new Error('JWT claims are invalid.');
  }

  if (
    payload.nbf !== undefined &&
    (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf > now)
  ) {
    throw new Error('JWT is not active.');
  }
}

function parseJwks(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.keys)) {
    throw new Error('JWKS response is invalid.');
  }

  const keys: AccessJwk[] = [];
  for (const candidate of value.keys) {
    if (
      isRecord(candidate) &&
      candidate.kty === 'RSA' &&
      typeof candidate.kid === 'string' &&
      candidate.kid.length > 0 &&
      typeof candidate.n === 'string' &&
      typeof candidate.e === 'string'
    ) {
      keys.push(candidate as AccessJwk);
    }
  }

  if (keys.length === 0) {
    throw new Error('JWKS contains no usable keys.');
  }

  return keys;
}

async function loadJwks(configuration: AccessConfiguration, forceRefresh = false) {
  const cached = jwksCache.get(configuration.issuer);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const response = await fetch(configuration.jwksUrl, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
  });

  if (!response.ok) {
    throw new Error('JWKS request failed.');
  }

  const keys = parseJwks(await response.json());
  jwksCache.set(configuration.issuer, {
    expiresAt: Date.now() + JWKS_CACHE_TTL_MS,
    keys,
  });
  return keys;
}

async function verifyAccessJwt(token: string, configuration: AccessConfiguration) {
  if (token.length === 0 || token.length > MAX_ACCESS_TOKEN_LENGTH) {
    throw new Error('JWT length is invalid.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('JWT structure is invalid.');
  }

  const header = decodeJsonPart(parts[0]);
  const payload = decodeJsonPart(parts[1]);
  const signature = decodeBase64Url(parts[2]);

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new Error('JWT algorithm or key id is invalid.');
  }

  validateClaims(payload, configuration);

  let keys = await loadJwks(configuration);
  let jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    keys = await loadJwks(configuration, true);
    jwk = keys.find((candidate) => candidate.kid === header.kid);
  }

  if (
    !jwk ||
    (jwk.alg !== undefined && jwk.alg !== 'RS256') ||
    (jwk.use !== undefined && jwk.use !== 'sig')
  ) {
    throw new Error('JWT signing key is invalid.');
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['verify'],
  );
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const isSignatureValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    signingInput,
  );

  if (!isSignatureValid) {
    throw new Error('JWT signature is invalid.');
  }

  return payload as AccessClaims;
}

export async function authorizeAccessRequest(
  request: Request,
  env: AccessEnvironment,
): Promise<AccessAuthorizationResult> {
  if (isLocalAuthBypassRequest(request, env)) {
    return { identity: { kind: 'local', subject: 'local-development' }, ok: true };
  }

  const configuration = getAccessConfiguration(env);
  if (!configuration) {
    return {
      code: 'SETUP_REQUIRED',
      message: 'Authentication is not configured.',
      ok: false,
      status: 503,
    };
  }

  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) {
    return {
      code: 'AUTH_REQUIRED',
      message: 'Authentication is required.',
      ok: false,
      status: 401,
    };
  }

  try {
    const claims = await verifyAccessJwt(token, configuration);
    return { identity: { claims, kind: 'access' }, ok: true };
  } catch {
    return {
      code: 'AUTH_INVALID',
      message: 'Authentication token is invalid.',
      ok: false,
      status: 401,
    };
  }
}

/** Clears the process-local JWKS cache for isolated security tests. */
export function clearAccessJwksCache() {
  jwksCache.clear();
}
