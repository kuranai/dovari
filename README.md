# Dovari

Dovari is a small, browser-first personal knowledge base. The React/Vite SPA and its Cloudflare
Worker now run together locally; product features are added in later phases.

## Local development

Requirements: Node.js 20.19 or newer and npm 10.8 or newer.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

The relational schema is declared in `src/worker/db/schema.ts`. Generate a new Drizzle migration
with `npm run db:generate`; the generated SQL in `migrations/` is what Wrangler applies. The FTS5
virtual table and synchronization triggers are kept in the custom SQL migration
`migrations/0001_pages_fts.sql`. Apply the same checked-in migrations to a configured remote D1
only when intended:

```sh
npm run db:migrate:remote
```

The development server prints the local URL, normally `http://localhost:5173`. The Vite dev server
uses the same Worker entrypoint as the production build. Local D1 and R2 storage are used by
default. For the local authentication bypass, copy the ignored example file:

```sh
cp .dev.vars.example .dev.vars
```

The bypass is accepted only for `localhost`, `127.0.0.1`, and `[::1]`; it is never accepted for a
remote hostname. `.dev.vars` must not be used in a deployed Worker.

The local-only CSP permits inline styles because Vite injects styles for HMR during development;
the production CSP does not contain `unsafe-inline`.

After changing the Worker or Wrangler configuration, regenerate the committed binding types:

```sh
npm run types:generate
```

To run the built Worker locally:

```sh
npm run build
npm run preview
```

`wrangler.jsonc` deliberately has no remote resource IDs or preview IDs and marks D1/R2 as local
for development. Use `--remote` explicitly when a command is intended to access Cloudflare data.

## Quality checks

```sh
npm run ci
```

The individual checks are also available when iterating locally:

```sh
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
```

`npm test` runs Worker integration tests in the local Workers runtime and client tests in JSDOM.
The Worker suite uses isolated local D1 and R2 bindings. Install the Chromium browser once before
running the production-preview smoke test:

```sh
npx playwright install chromium
npm run test:e2e
```

The E2E command builds the production Worker, starts `vite preview` on a loopback host, and checks
that the app shell loads through the Worker routing path.

The source tree keeps client code under `src/client`, Worker code under `src/worker`, and shared
contracts under `src/shared`. The Worker classifies private, public, static, health, and unknown
paths centrally. Private application and API paths require the security boundary described below;
the Pages API is the first product API and the browser UI follows in a later phase.

## Pages API

The private Pages API is available to authenticated editors at:

```text
GET    /api/private/pages
POST   /api/private/pages
GET    /api/private/pages/:id
PATCH  /api/private/pages/:id
PUT    /api/private/pages/:id/content
DELETE /api/private/pages/:id
```

Mutation requests must be same-origin. Metadata and content updates use `baseRevision`; stale
writes return `409 PAGE_CONFLICT`. Page content is validated against the server-side Tiptap
allowlist, and `contentText` is derived on the server.

## Cloudflare Access setup

Production protects only the private application and API:

```text
/app/*
/api/private/*
```

Create a Cloudflare Access Self-hosted application for the deployed hostname and configure an
explicit Allow policy for the intended editors. Use concrete email addresses or groups. GitHub
may be selected as an identity provider inside Access; Dovari does not implement a separate GitHub
OAuth or session stack.

After creating the Access application, configure these Worker variables in the Cloudflare
dashboard under Variables and Secrets (or through the corresponding Wrangler commands):

```text
DOVARI_ENV=production
ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
ACCESS_AUD=<the Access application audience tag>
```

The Worker validates `Cf-Access-Jwt-Assertion` on every private request, including the signature
against the team JWKS, issuer, audience, expiration, and not-before claims. A missing or malformed
production configuration returns `503 SETUP_REQUIRED` before D1 or R2 is touched. Health and
content-free static assets remain public.

API errors use one shape and include the request identifier in both the `X-Request-ID` response
header and the JSON response:

```json
{
  "error": { "code": "AUTH_REQUIRED", "message": "Authentication is required." },
  "requestId": "..."
}
```
