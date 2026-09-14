# Dovari

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kuranai/dovari)
[![CI](https://github.com/kuranai/dovari/actions/workflows/ci.yml/badge.svg)](https://github.com/kuranai/dovari/actions/workflows/ci.yml)

## Quick Start für Dummies

Du musst nicht alle Cloudflare-Begriffe kennen. Entscheide dich zuerst für einen Weg:

### Nur lokal ausprobieren

Dafür brauchst du weder ein Cloudflare-Konto noch Access-Variablen:

```sh
git clone https://github.com/kuranai/dovari.git
cd dovari
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Öffne danach die angezeigte Adresse, normalerweise `http://localhost:5173`. Die Datei `.dev.vars`
enthält nur `DOVARI_ENV=local`, wird nicht mit Git versioniert und aktiviert den Login-Bypass
ausschließlich auf deinem eigenen Rechner. Für lokal musst du `ACCESS_TEAM_DOMAIN` und
`ACCESS_AUD` nicht ausfüllen.

### Online bei Cloudflare starten – Klick für Klick

#### 1. Dovari deployen

1. Klicke oben auf **Deploy to Cloudflare**.
2. Melde dich bei Cloudflare an und wähle dein Konto.
3. Lass die Namen `dovari` (Worker und Datenbank) und `dovari-assets` (R2-Bucket) unverändert.
4. Warte, bis Cloudflare „Deployment complete“ anzeigt. Notiere dir die Worker-Adresse, zum
   Beispiel `https://dovari.<dein-account-subdomain>.workers.dev`.

Direkte Links: [Cloudflare Workers & Pages öffnen](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
und [Cloudflare Zero Trust öffnen](https://one.dash.cloudflare.com/).

#### 2. Einmalig Cloudflare Zero Trust einrichten

1. Öffne [Cloudflare Zero Trust](https://one.dash.cloudflare.com/), wähle dein Konto und klicke
   links auf **Settings**.
2. Öffne **Team name and domain**. Falls Cloudflare zuerst eine Zero-Trust-Organisation anlegen
   möchte, wähle einen Teamnamen, zum Beispiel `meine-notizen`.
3. Kopiere dort den Wert **Team domain**. Er sieht so aus:
   `https://meine-notizen.cloudflareaccess.com`. Das ist später `ACCESS_TEAM_DOMAIN`.

#### 3. Die Dovari-Login-Schranke anlegen

1. Öffne in Zero Trust links **Access controls → Applications**.
2. Klicke **Create new application**.
3. Wähle **Self-hosted and private**.
4. Klicke **Add public hostname** und trage deine Worker-Adresse ein. Wenn Cloudflare getrennte
   Felder zeigt, gehören `dovari.<dein-account-subdomain>` in **Subdomain** und `workers.dev` in
   **Domain**.
5. Lege für denselben Host vier Einträge in derselben Access-Anwendung an: die exakten Pfade
   `/app` und `/api/private` sowie die Unterpfade `/app/*` und `/api/private/*`. Cloudflare
   schließt bei einem Pfad wie `/app/*` den Elternpfad `/app` nicht automatisch ein.
6. Unter **Access policies** eine Regel anlegen: **Decision: Allow**, **Selector: Emails**, bei
   **Value** deine eigene E-Mail-Adresse eintragen.
7. Klicke **Save application** bzw. **Create application**.

Access ist damit die Login-Seite vor Dovari. Der öffentliche Einstieg `/` leitet auf das geschützte
`/app` weiter. Dovari prüft zusätzlich das von Access ausgestellte JWT. Die
[offizielle Anleitung für Self-hosted Applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
und die [Regeln für Pfade und `*`-Wildcards](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
zeigen dieselben Cloudflare-Menüs.

#### 4. Was genau ist `ACCESS_AUD`?

`ACCESS_AUD` ist eine lange, von Cloudflare erzeugte ID für genau diese Access-Anwendung. Sie ist
nicht:

- deine E-Mail-Adresse,
- die Worker-Adresse,
- der Teamname oder
- `ACCESS_TEAM_DOMAIN`.

So findest du sie:

1. Bleibe in [Cloudflare Zero Trust](https://one.dash.cloudflare.com/).
2. Klicke links **Access controls → Applications**.
3. Klicke bei deiner Dovari-Anwendung auf **Configure**.
4. Öffne **Additional settings**.
5. Kopiere **Application Audience (AUD) Tag** vollständig. Das ist `ACCESS_AUD`, zum Beispiel:
   `32eafc7626e974616deaf0dc3ce63d7bcbed58a2731e84d06bc3cdf1b53c422`.

Cloudflare beschreibt den AUD-Fundort auch unter [Get your AUD tag](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag).
Der AUD bleibt gleich, solange du diese Access-Anwendung nicht löschst und neu erstellst.

#### 5. Die drei Werte am richtigen Ort eintragen

1. Öffne [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages).
2. Klicke auf den Worker **dovari**.
3. Klicke oben auf **Settings**.
4. Scrolle zu **Variables and Secrets** und klicke **Add** bzw. **Add variable**.
5. Wähle als Typ **Text** und lege diese drei Variablen exakt an:

   | Name                 | Wert                                                        |
   | -------------------- | ----------------------------------------------------------- |
   | `DOVARI_ENV`         | `production`                                                |
   | `ACCESS_TEAM_DOMAIN` | der kopierte Wert aus **Team domain**, inklusive `https://` |
   | `ACCESS_AUD`         | der kopierte Wert aus **Application Audience (AUD) Tag**    |

6. Klicke im Variablen-Dialog auf **Deploy**.

Diese Werte gehören in die Cloudflare-Worker-Einstellungen, nicht in `.dev.vars` und nicht in
`wrangler.jsonc`. Eine [offizielle Anleitung für Worker-Variablen](https://developers.cloudflare.com/workers/configuration/environment-variables/#add-environment-variables-via-the-dashboard)
zeigt denselben Weg.

Wenn du anschließend `https://dovari.<dein-account-subdomain>.workers.dev/app` öffnest, solltest
du die Access-Anmeldung sehen. Wenn Dovari `SETUP_REQUIRED` meldet, fehlt eine der drei Variablen
oder du hast im Dashboard noch nicht auf **Deploy** geklickt.

`DB`, `ASSETS` und `STATIC_ASSETS` sind keine Variablen, die du selbst eintragen musst. Das sind
interne Bindings, die der Deploy-Vorgang automatisch mit D1, R2 und den statischen Dateien
verknüpft. Einen `DOVARI_SMOKE_ACCESS_JWT` brauchst du nur für einen technischen Smoke-Test; ihn
niemals ins Repository oder in die Worker-Variablen kopieren.

Dovari is a small, browser-first personal knowledge base. The React/Vite SPA and its Cloudflare
Worker run together, with D1 for structured data, R2 for private assets, and Cloudflare Access for
the private workspace.

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

Open the URL printed by Vite, normally `http://localhost:5173`. Local D1 and R2 state is kept by
Wrangler and is separate from production. `.dev.vars` enables the authentication bypass only for
`localhost`, `127.0.0.1`, and `[::1]`; it is gitignored and must never be deployed.

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
bindings enabled.

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
npm run deploy
```

`npm run deploy` is the release runner. It builds the application, lets Wrangler provision or
connect D1 and R2, applies every pending migration to the remote `DB` binding, and deploys the
migrated Worker again. `--keep-vars` is passed to deployment so variables configured in the
Cloudflare dashboard are not removed by a later deploy.

To validate the production artifact without creating or changing Cloudflare resources:

```sh
npm run deploy:dry-run
```

The first provisioning step does not configure Cloudflare Access; that is intentionally a manual
security boundary. Before Access is configured, private paths remain fail-closed and do not expose
the workspace.

### Cloudflare Access (required post-deploy step)

Create a Cloudflare Access Self-hosted application for the deployed hostname and add an explicit
Allow policy for the intended editor email addresses, groups, or GitHub identities. Protect these
paths:

```text
/app
/app/*
/api/private
/api/private/*
```

Both the exact parent paths and their wildcard children are required because an Access path ending
in `/*` does not include its parent path. The public `/` entry point redirects to the protected
`/app` path.

GitHub is an optional identity provider inside Access. Dovari does not run a separate OAuth or
session service.

In the Worker environment variables/secrets, set:

```text
DOVARI_ENV=production
ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
ACCESS_AUD=<the Access application audience tag>
```

Deploy once more after setting the values:

```sh
npm run deploy
```

The Worker validates the Access JWT signature against the team JWKS, issuer, audience, expiry, and
not-before claims. A missing production configuration returns `503 SETUP_REQUIRED` before D1 or R2
is touched. `/api/health` remains a content-free liveness check.

### Custom domain

After the Worker is deployed, open the Worker in the Cloudflare dashboard and use **Settings →
Domains & Routes → Add Custom Domain**. Choose the hostname that should host Dovari and wait for
Cloudflare to provision its DNS/TLS record. Update the Access application to cover that exact
hostname and verify the two private path patterns above. No R2 public domain is needed: asset bytes
are served only through the authenticated Worker.

### Deployment smoke checks

Run the unauthenticated fail-closed check against the deployed hostname:

```sh
npm run release:smoke -- https://dovari.example.com
```

It checks public health and confirms that `/app` and `/api/private/pages` are not reachable without
Access. For an authenticated API smoke, provide a short-lived Access JWT through the environment;
never commit it:

```sh
DOVARI_SMOKE_ACCESS_JWT='…' npm run release:smoke -- https://dovari.example.com
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
applies all migrations through P22 twice to an isolated local D1, checks foreign keys and FTS5, and
performs a Wrangler production dry-run:

```sh
npm run release:install-smoke
```

## API and security notes

Private Page, Asset, Search, Export, Trash, Revision, Backup, and Restore routes live under
`/api/private/*` and require Access in production. Browser mutations also require a matching
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

- Access application and policy creation is a required manual post-deploy step; Wrangler cannot
  safely choose the people who should access a private workspace.
- The release has no public page routes, teams, roles, comments, or foreign-system import.
- Asset metadata deletion is soft deletion; physical garbage collection is intentionally deferred.
- A restore target must be empty. Merging a backup into an existing workspace is not supported.
