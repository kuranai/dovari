# Dovari

Dovari is a small, browser-first personal knowledge base. The project is currently in its
foundation phase: the React/Vite application shell is ready, while Cloudflare integration and
product features are added in later phases.

## Local development

Requirements: Node.js 20.19 or newer and npm 10.8 or newer.

```sh
npm ci
npm run dev
```

The development server prints the local URL, normally `http://localhost:5173`.

## Quality checks

```sh
npm run build
npm run typecheck
npm run lint
npm run format:check
```

The source tree keeps client code under `src/client`, future Worker code under `src/worker`, and
dependency-free shared contracts under `src/shared`. Cloudflare bindings and Worker routing are
intentionally deferred to phase P01.
