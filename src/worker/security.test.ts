import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAccessJwksCache } from './auth/access';
import { app } from './index';
import type { WorkerBindings } from './types';

const TEAM_DOMAIN = 'https://team.example.test';
const AUDIENCE = 'dovari-editor';
const KEY_ID = 'security-test-key';

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
const testCrypto = globalThis.crypto;

const jwksFetch = vi.fn(async () => new Response('{}', { status: 500 }));

function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function createToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: KEY_ID, typ: 'JWT' };
  const payload = {
    aud: AUDIENCE,
    exp: now + 3600,
    iss: TEAM_DOMAIN,
    nbf: now - 1,
    sub: 'editor-1',
    ...overrides,
  };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await testCrypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function makeEnvironment(overrides: Partial<WorkerBindings> = {}) {
  const staticFetch = vi.fn(async (request: Request) => {
    const pathname = new URL(request.url).pathname;
    return new Response(`static:${pathname}`, {
      headers: { 'content-type': 'text/plain' },
    });
  });
  const first = vi.fn(async () => ({ ok: 1 }));
  const all = vi.fn(async () => ({ results: [] }));
  const prepare = vi.fn(() => ({ all, first }));
  const head = vi.fn(async () => null);

  const env = {
    ACCESS_AUD: AUDIENCE,
    ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
    ASSETS: { head },
    DB: { prepare },
    DOVARI_ENV: 'production',
    STATIC_ASSETS: { fetch: staticFetch },
    ...overrides,
  } as unknown as WorkerBindings;

  return { env, head, prepare, staticFetch };
}

async function fetchApp(pathname: string, env: WorkerBindings, init?: RequestInit) {
  return app.fetch(new Request(`https://wiki.example${pathname}`, init), env);
}

beforeAll(async () => {
  const keyPair = await testCrypto.subtle.generateKey(
    {
      hash: 'SHA-256',
      modulusLength: 2048,
      name: 'RSASSA-PKCS1-v1_5',
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ['sign', 'verify'],
  );

  privateKey = keyPair.privateKey;
  publicJwk = await testCrypto.subtle.exportKey('jwk', keyPair.publicKey);
});

beforeEach(() => {
  clearAccessJwksCache();
  vi.stubGlobal('crypto', testCrypto);
  jwksFetch.mockReset();
  jwksFetch.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          keys: [{ ...publicJwk, alg: 'RS256', kid: KEY_ID, use: 'sig' }],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  );
  vi.stubGlobal('fetch', jwksFetch);
});

afterEach(() => {
  clearAccessJwksCache();
  vi.unstubAllGlobals();
});

describe('worker security boundary', () => {
  it('rejects missing, malformed, expired, and incorrectly addressed tokens', async () => {
    const { env } = makeEnvironment();

    const missing = await fetchApp('/api/private/pages', env);
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    });

    const malformed = await fetchApp('/api/private/pages', env, {
      headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' },
    });
    expect(malformed.status).toBe(401);

    const encodedPrivate = await fetchApp('/api/private%2Fpages', env);
    expect(encodedPrivate.status).toBe(401);

    const expired = await createToken({ exp: Math.floor(Date.now() / 1000) - 1 });
    const expiredResponse = await fetchApp('/api/private/pages', env, {
      headers: { 'Cf-Access-Jwt-Assertion': expired },
    });
    expect(expiredResponse.status).toBe(401);

    const wrongAudience = await createToken({ aud: 'another-access-application' });
    const wrongAudienceResponse = await fetchApp('/api/private/pages', env, {
      headers: { 'Cf-Access-Jwt-Assertion': wrongAudience },
    });
    expect(wrongAudienceResponse.status).toBe(401);

    const wrongIssuer = await createToken({ iss: 'https://another-team.example.test' });
    const wrongIssuerResponse = await fetchApp('/api/private/pages', env, {
      headers: { 'Cf-Access-Jwt-Assertion': wrongIssuer },
    });
    expect(wrongIssuerResponse.status).toBe(401);
  });

  it('verifies a valid Access token and lets it reach the private router', async () => {
    const { env } = makeEnvironment();
    const token = await createToken();

    const response = await fetchApp('/api/private/pages', env, {
      headers: {
        'Cf-Access-Jwt-Assertion': token,
        'X-Request-ID': 'security-test-request',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('security-test-request');
    expect(jwksFetch).toHaveBeenCalledWith(`${TEAM_DOMAIN}/cdn-cgi/access/certs`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
    });
    await expect(response.json()).resolves.toEqual({ pages: [] });
  });

  it('rejects a token with a bad signature', async () => {
    const { env } = makeEnvironment();
    const token = await createToken();
    const separator = token.lastIndexOf('.');
    const signature = token.slice(separator + 1);
    const changedFirstByte = signature[0] === 'A' ? 'B' : 'A';
    const invalidToken = `${token.slice(0, separator + 1)}${changedFirstByte}${signature.slice(1)}`;

    const response = await fetchApp('/api/private/pages', env, {
      headers: { 'Cf-Access-Jwt-Assertion': invalidToken },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AUTH_INVALID' },
    });
  });

  it('fails closed when production Access configuration is missing', async () => {
    const { env, head, prepare, staticFetch } = makeEnvironment({
      ACCESS_AUD: undefined,
      ACCESS_TEAM_DOMAIN: undefined,
    });

    const appResponse = await fetchApp('/app', env);
    const apiResponse = await fetchApp('/api/private/pages', env);

    expect(appResponse.status).toBe(503);
    expect(apiResponse.status).toBe(503);
    await expect(appResponse.json()).resolves.toMatchObject({
      error: { code: 'SETUP_REQUIRED' },
    });
    expect(staticFetch).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });

  it('keeps health and static files public without exposing private data', async () => {
    const { env, head, prepare, staticFetch } = makeEnvironment({
      ACCESS_AUD: undefined,
      ACCESS_TEAM_DOMAIN: undefined,
    });

    const health = await fetchApp('/api/health', env);
    const asset = await fetchApp('/assets/app.js', env);

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });
    expect(asset.status).toBe(200);
    expect(staticFetch).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(head).toHaveBeenCalledTimes(1);
    expect(health.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(health.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(asset.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(asset.headers.get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows the local bypass only on loopback hosts', async () => {
    const { env, staticFetch } = makeEnvironment({
      ACCESS_AUD: undefined,
      ACCESS_TEAM_DOMAIN: undefined,
      DOVARI_ENV: 'local',
    });

    const localResponse = await app.fetch(
      new Request('http://localhost/app', {
        headers: {
          Authorization: 'Bearer should-not-reach-static-assets',
          Cookie: 'access=should-not-reach-static-assets',
          'Cf-Access-Jwt-Assertion': 'should-not-reach-static-assets',
        },
      }),
      env,
    );
    const remoteResponse = await fetchApp('/app', env);

    expect(localResponse.status).toBe(200);
    expect(remoteResponse.status).toBe(503);
    expect(staticFetch).toHaveBeenCalledTimes(1);
    const localCsp = localResponse.headers.get('Content-Security-Policy');
    expect(localCsp).toContain("script-src 'self' 'unsafe-inline'");
    expect(localCsp).toContain("style-src 'self' 'unsafe-inline'");
    const staticRequest = staticFetch.mock.calls[0]?.[0];
    expect(staticRequest).toBeInstanceOf(Request);
    expect(staticRequest?.headers.has('Authorization')).toBe(false);
    expect(staticRequest?.headers.has('Cookie')).toBe(false);
    expect(staticRequest?.headers.has('Cf-Access-Jwt-Assertion')).toBe(false);
  });

  it('does not relax the production script policy', async () => {
    const { env } = makeEnvironment();
    const token = await createToken();

    const response = await fetchApp('/app', env, {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(response.headers.get('Content-Security-Policy')).not.toContain("'unsafe-inline'");
  });

  it('requires same-origin requests for private mutations', async () => {
    const { env } = makeEnvironment();
    const token = await createToken();
    const headers = { 'Cf-Access-Jwt-Assertion': token };

    const missingOrigin = await fetchApp('/api/private/pages', env, {
      headers,
      method: 'POST',
    });
    const foreignOrigin = await fetchApp('/api/private/pages', env, {
      headers: { ...headers, Origin: 'https://evil.example' },
      method: 'POST',
    });
    const sameOrigin = await fetchApp('/api/private/pages', env, {
      headers: { ...headers, Origin: 'https://wiki.example' },
      method: 'POST',
    });

    expect(missingOrigin.status).toBe(403);
    expect(foreignOrigin.status).toBe(403);
    expect(sameOrigin.status).toBe(400);
    await expect(foreignOrigin.json()).resolves.toMatchObject({
      error: { code: 'ORIGIN_MISMATCH' },
    });
  });

  it('does not route unknown API paths or reserved public APIs to static or private handlers', async () => {
    const { env, staticFetch } = makeEnvironment({
      ACCESS_AUD: undefined,
      ACCESS_TEAM_DOMAIN: undefined,
    });

    const unknownApi = await fetchApp('/api/unknown.js', env);
    const publicApi = await fetchApp('/api/public/pages', env);

    expect(unknownApi.status).toBe(404);
    expect(publicApi.status).toBe(404);
    expect(staticFetch).not.toHaveBeenCalled();
  });
});
