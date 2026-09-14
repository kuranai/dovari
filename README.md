# Dovari

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kuranai/dovari)
[![CI](https://github.com/kuranai/dovari/actions/workflows/ci.yml/badge.svg)](https://github.com/kuranai/dovari/actions/workflows/ci.yml)

## Quick Start für Dummies

### Nur lokal ausprobieren

Dafür brauchst du kein Cloudflare-Konto:

```sh
git clone https://github.com/kuranai/dovari.git
cd dovari
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Öffne vor dem Start `.dev.vars` und ersetze den Beispielwert hinter `DOVARI_PASSWORD` durch ein
Passwort mit mindestens 16 Zeichen und höchstens 256 UTF-8-Bytes. Leerzeichen werden weder
entfernt noch normalisiert. Die Datei wird nicht mit Git versioniert. Danach öffnest du die von
Vite angezeigte Adresse, normalerweise `http://localhost:5173`, und meldest dich damit an.

### Online bei Cloudflare starten – Klick für Klick

#### 1. Dovari deployen

1. Klicke oben auf **Deploy to Cloudflare**.
2. Melde dich bei Cloudflare an und wähle dein Konto.
3. Trage bei `DOVARI_PASSWORD` ein privates Passwort mit mindestens 16 Zeichen und höchstens 256
   UTF-8-Bytes ein. Cloudflare speichert es als verschlüsseltes Worker-Secret.
4. Lass die Namen `dovari` (Worker und Datenbank) und `dovari-assets` (R2-Bucket) unverändert.
5. Warte, bis Cloudflare „Deployment complete“ anzeigt. Öffne danach die Worker-Adresse, zum
   Beispiel `https://dovari.<dein-account-subdomain>.workers.dev`.

Das war es: Dovari zeigt seine eigene Login-Seite. Eine zusätzliche Zero-Trust-Anwendung, AUD-Werte
und ein externer Identity Provider sind für die Standardinstallation nicht nötig. `DB`, `ASSETS`,
`STATIC_ASSETS` und die Worker-Versionsinformationen werden automatisch gebunden.

Das Passwort kann später unter **Workers & Pages → dovari → Settings → Variables and Secrets**
als Secret `DOVARI_PASSWORD` geändert werden. Nach dem Speichern erzeugt Cloudflare eine neue
Worker-Version; dadurch werden alle bisherigen Sitzungen ungültig.

Dovari is a small, browser-first personal knowledge base. The React/Vite SPA and its Cloudflare
Worker run together, with D1 for structured data and sessions, R2 for private assets, and one
deployment-time instance password for the private workspace.

The version-1 workflow is deliberately focused: create a page, write without entering an edit
mode, paste screenshots, search later, and recover pages, revisions, assets, and links from a
lossless backup.

## Requirements

- Node.js 26 or newer
- npm 11 or newer
- A Cloudflare account with Workers, D1, and R2 available for production deployment

The runtime requirement is intentional. The Workers test runtime used by Dovari does not run on
older Node versions.

## Local development

```sh
git clone https://github.com/kuranai/dovari.git
cd dovari
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Before starting, replace the example `DOVARI_PASSWORD` in `.dev.vars` with 16 or more characters
and at most 256 UTF-8 bytes. Whitespace is neither trimmed nor normalized. Open the URL printed by
Vite, normally `http://localhost:5173`, and sign in. Local D1 and R2 state is kept by Wrangler and
is separate from production. Local development uses the same login and session boundary as
production; there is no bypass.

To run the production-shaped local Worker:

```sh
npm run build
npm run preview
```

`wrangler.jsonc` intentionally contains no account-specific IDs. Local development uses the same
binding names as production (`DB`, `ASSETS`, and `STATIC_ASSETS`). Use an explicit `--remote` only
when you mean to operate on Cloudflare data.

## Daily workflow

Open `/app` to enter the private workspace. Pages use stable URLs at `/app/pages/<page-id>`.
`New page` and `Ctrl/Cmd+N` create a page; the title and rich-text document are immediately
editable. Content is saved automatically and stale writes are rejected as conflicts.

The editor supports headings, marks, lists, checklists, quotes, code, links, Wiki Links, images,
and attachments. Paste or drop files directly into the document. In an empty paragraph, type `/`
for the accessible Slash Command palette. The visible toolbar remains available as a keyboard
fallback.

`Ctrl/Cmd+K` opens search and navigation. Settings groups theme, recent pages, Trash, version
history, and the lossless backup/restore workflow. The Markdown/ZIP export remains available from
the sidebar.

## Deploy to Cloudflare

### One-click setup

Click the **Deploy to Cloudflare** button at the top of this file. Cloudflare clones the public
repository into the selected account and opens the Workers setup flow. Keep the `DB` and `ASSETS`
bindings enabled and enter a private `DOVARI_PASSWORD` of at least 16 characters and at most 256
UTF-8 bytes when prompted. Cloudflare stores it as an encrypted Worker secret rather than a
plaintext variable.

The checked-in Wrangler configuration asks Wrangler to automatically provision or connect:

```text
D1 database: dovari
R2 bucket:   dovari-assets
Worker:      dovari
```

If one of those names already exists in the account, choose different names in the deploy form or
in the cloned `wrangler.jsonc`. Do not copy resource IDs from another account into the public
repository.

### CLI deployment

For an existing checkout, authenticate Wrangler and run:

```sh
npm ci
npx wrangler login
npx wrangler secret put DOVARI_PASSWORD
npm run deploy
```

Enter 16 or more characters, up to 256 UTF-8 bytes, at the secret prompt. The command stores the
value in Cloudflare; do not add the production password to `.dev.vars` or any committed file.

`npm run deploy` is the release runner. It builds the application, lets Wrangler provision or
connect D1 and R2, applies every pending migration to the remote `DB` binding, and deploys the
migrated Worker again. `--keep-vars` is passed to deployment so variables configured in the
Cloudflare dashboard are not removed by a later deploy.

To validate the production artifact without creating or changing Cloudflare resources:

```sh
npm run deploy:dry-run
```

There is no required post-deploy identity-provider setup. Dovari redirects an unauthenticated
browser to `/login`, creates a 30-day secure session after a successful password check, and keeps
private APIs at `401`. Missing or invalid password configuration returns `503 SETUP_REQUIRED`
before private D1 or R2 data is read. `/api/health` remains a content-free liveness check.

To change the password, replace the `DOVARI_PASSWORD` secret under the Worker's **Settings →
Variables and Secrets** and deploy that configuration. Sessions are tied to the Cloudflare Worker
version, so a password change or any other deployment signs out all devices.

### Custom domain

After the Worker is deployed, open the Worker in the Cloudflare dashboard and use **Settings →
Domains & Routes → Add Custom Domain**. Choose the hostname that should host Dovari and wait for
Cloudflare to provision its DNS/TLS record. No additional authentication configuration and no R2
public domain are needed: asset
bytes are served only through the authenticated Worker.

### Deployment smoke checks

Run the unauthenticated fail-closed check against the deployed hostname:

```sh
npm run release:smoke -- https://dovari.example.com
```

It checks public health and confirms that `/app` and `/api/private/pages` are not reachable without
a Dovari session. For an authenticated API smoke, provide the instance password only through the
process environment; never commit it:

```sh
DOVARI_SMOKE_PASSWORD='…' npm run release:smoke -- https://dovari.example.com
```

The authenticated check only reads the private Pages list. Use the browser E2E suite after signing
in to exercise the complete private workflow.

## Backup and restore

The Settings area exposes a separate `dovari-backup-v1.zip` workflow. The archive includes active
and deleted pages, stable IDs, hierarchy and positions, Tiptap JSON, page revisions, Wiki Links,
and every asset including unreferenced or soft-deleted assets. Asset bytes are stored under
canonical ZIP paths and verified with their declared size and SHA-256 checksum.

Restore validates the archive locally in the browser and uploads records/assets through a resumable
private session. It is accepted only by an empty workspace; the server checks that condition again
immediately before the atomic commit. A cancelled session removes only its staged records and
temporary R2 objects.

Private backup endpoints:

```text
GET    /api/private/backup
POST   /api/private/restore/sessions
GET    /api/private/restore/sessions/:id
PUT    /api/private/restore/sessions/:id/records/:recordType/:recordId
PUT    /api/private/restore/sessions/:id/assets/:assetId
POST   /api/private/restore/sessions/:id/finalize
DELETE /api/private/restore/sessions/:id
```

## Quality checks

The normal local gate is:

```sh
npm run ci
```

This runs formatting, linting, typechecking, Worker/client tests, and the production build.
Install Chromium once for the browser suite:

```sh
npx playwright install chromium
npm run test:e2e
```

The critical browser suite covers page creation/editing, autosave, hierarchy, safe links and Wiki
Links, search/navigation, responsive accessibility, Trash/Undo, revision restore, Settings, Slash
Commands, export, and backup/restore. Worker integration tests additionally verify a lossless
roundtrip of hierarchy, deleted pages, revisions, Wiki Links, FTS, and assets.

The release-only fresh-install check copies the current checkout, installs from the lockfile,
applies every committed migration twice to an isolated local D1, checks foreign keys and FTS5, and
performs a Wrangler production dry-run:

```sh
npm run release:install-smoke
```

## API and security notes

The public authentication endpoints are:

```text
GET  /api/auth/session
POST /api/auth/login
POST /api/auth/logout
```

Private Page, Asset, Search, Export, Trash, Revision, Backup, and Restore routes live under
`/api/private/*` and require a valid Dovari session. Browser mutations also require a matching
same-origin `Origin` header. R2 remains private; the browser never receives S3 credentials or a
public object URL.

The main private endpoints are:

```text
GET    /api/private/pages
POST   /api/private/pages
GET    /api/private/pages/:id
PATCH  /api/private/pages/:id
PUT    /api/private/pages/:id/content
DELETE /api/private/pages/:id
POST   /api/private/assets
GET    /api/private/assets/:id/content
GET    /api/private/search?q=<query>
GET    /api/private/export
```

Page metadata and content updates carry `baseRevision`; stale writes return `409 PAGE_CONFLICT`.
The server validates Tiptap JSON and derives searchable plaintext. Asset uploads use the raw
request body with `Content-Type` and the percent-encoded `X-Dovari-Filename` header, support PNG,
JPEG, WebP, GIF, PDF, text, Markdown, ZIP, and generic binary files up to 25 MiB, and reject SVG
and HTML.

The checked-in migrations are the source of truth for D1. Generate a new Drizzle migration with
`npm run db:generate`, review it, then apply it locally before a remote deployment. Migrations are
kept backward-compatible with the currently deployed Worker.

## Known version-1 limits

- Version 1 has one shared owner password, no password reset, no MFA, and no individual accounts.
- The release has no public page routes, teams, roles, comments, or foreign-system import.
- Asset metadata deletion is soft deletion; physical garbage collection is intentionally deferred.
- A restore target must be empty. Merging a backup into an existing workspace is not supported.
