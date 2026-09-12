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

The development server prints the local URL, normally `http://localhost:5173`. The Vite dev server
uses the same Worker entrypoint as the production build. Local D1 and R2 storage are used by
default; no Cloudflare account or secrets are required for this phase. Copy `.dev.vars.example` to
`.dev.vars` only when you need local Worker variables.

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
npm run build
npm run typecheck
npm run lint
npm run format:check
```

The source tree keeps client code under `src/client`, Worker code under `src/worker`, and
dependency-free shared contracts under `src/shared`. The Worker classifies private, public,
static, health, and unknown paths centrally; authentication and product APIs are introduced in
later phases.
