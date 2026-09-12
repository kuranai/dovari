# Dovari – Implementierungsstatus und Phasenplan

**Dieses Dokument ist die kanonische Quelle für den aktuellen Implementierungsstand.**  
**Letzte Aktualisierung:** 12. September 2026  
**Gesamtstatus:** P00 abgeschlossen, P01 bereit  
**Aktuelle Phase:** keine  
**Nächste Phase:** P01 – Cloudflare-Laufzeit und Bindings

## 1. Zweck

Jede Phase wird in einem frischen Chat mit begrenztem Kontext bearbeitet. Dieses Dokument sorgt dafür, dass trotzdem jederzeit eindeutig ist:

- was bereits fertig ist,
- was als Nächstes umgesetzt wird,
- welche Entscheidungen verbindlich sind,
- welche Prüfungen eine Phase abschließen,
- wo eine unterbrochene Arbeit fortgesetzt werden muss.

Produktanforderungen stehen in [`PLAN.md`](./PLAN.md). Verbindliche Architektur-, Datenmodell-, API- und Sicherheitsentscheidungen stehen in [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md). Dieses Dokument steuert ausschließlich die Umsetzung und hat für den **Arbeitsstand** Vorrang.

## 2. Standardprompt für jeden neuen Chat

Der folgende kurze Prompt genügt:

> Implementiere die nächste Phase.

Optional präziser:

> Lies `IMPLEMENTATION.md` und implementiere die nächste noch offene Phase vollständig. Aktualisiere danach den Status und dokumentiere die Verifikation.

Ein Agent muss bei diesem Prompt das Arbeitsprotokoll aus Abschnitt 3 befolgen. Es darf nicht nötig sein, dem Agenten den bisherigen Chatverlauf mitzugeben.

## 3. Verbindliches Arbeitsprotokoll

### 3.1 Beginn einer Phase

Der ausführende Agent muss:

1. `IMPLEMENTATION.md` vollständig lesen.
2. ausschließlich die im „Kontext-Routing“ in Abschnitt 6 für diese Phase genannten Teile aus `TECHNICAL_SPEC.md` und `PLAN.md` lesen; weitere Abschnitte nur bei einer konkret festgestellten Abhängigkeit.
3. vorhandene Repository-Anweisungen und den tatsächlichen Codezustand prüfen.
4. lokale Änderungen respektieren und nicht zusammenhangslos überschreiben.
5. die zu bearbeitende Phase nach dieser Priorität auswählen:
   1. eine Phase mit Status `IN PROGRESS`,
   2. eine Phase mit Status `BLOCKED`, falls der Blocker inzwischen lösbar ist,
   3. andernfalls die einzige Phase mit Status `NEXT`.
6. vor den ersten Implementierungsänderungen die Phase auf `IN PROGRESS` setzen und den Kopf dieses Dokuments aktualisieren.

Es wird immer genau **eine** Phase bearbeitet. Aufgaben späterer Phasen werden nicht vorgezogen, außer sie sind eine zwingende technische Voraussetzung. Eine solche Ausnahme muss im Statusprotokoll begründet werden.

### 3.2 Während der Phase

- Der Scope und die Nicht-Ziele der Phase sind verbindlich.
- Neue Architekturentscheidungen werden in `docs/adr/` dokumentiert, wenn sie von `TECHNICAL_SPEC.md` abweichen oder eine dort bewusst vertagte Entscheidung festlegen.
- Entdeckte Folgearbeit wird in Abschnitt 7 notiert und nicht still in den aktuellen Scope aufgenommen.
- Relevante Tests werden zusammen mit der Implementierung geschrieben.
- Der Agent hält dieses Dokument aktuell, falls die Arbeit unterbrochen wird.

### 3.3 Abschluss einer Phase

Eine Phase darf nur auf `DONE` gesetzt werden, wenn:

- alle Akzeptanzkriterien erfüllt sind,
- die für die Phase vorgeschriebenen Prüfungen erfolgreich gelaufen sind,
- relevante Dokumentation aktualisiert wurde,
- keine bekannte Regression im bearbeiteten Bereich verbleibt.

Danach muss der Agent in **derselben Änderung**:

1. die Phase in der Statustabelle auf `DONE` setzen,
2. die nächste geplante Phase auf `NEXT` setzen,
3. Kopfzeile, Kurzprotokoll und Datum aktualisieren,
4. die tatsächlich ausgeführten Prüfkommandos mit Ergebnis eintragen,
5. nach dieser Phase stoppen und keine weitere Phase beginnen.

Ist die Phase nicht fertig, bleibt sie `IN PROGRESS`. Bei einem echten externen Blocker erhält sie `BLOCKED`; Ursache und benötigte Aktion werden konkret dokumentiert. Die nächste Phase wird dann nicht automatisch begonnen.

## 4. Statuswerte

| Status | Bedeutung |
|---|---|
| `PLANNED` | Noch nicht an der Reihe |
| `NEXT` | Nächste zu beginnende Phase; davon darf es höchstens eine geben |
| `IN PROGRESS` | Begonnen und noch nicht vollständig abgeschlossen |
| `BLOCKED` | Begonnen, aber durch einen konkret dokumentierten externen Grund blockiert |
| `DONE` | Alle Akzeptanzkriterien erfüllt und verifiziert |

## 5. Gesamtfortschritt

| Phase | Meilenstein | Titel | Status | Ergebnis/Evidenz |
|---|---|---|---|---|
| P00 | Grundlage | Projekt-Scaffold | `DONE` | `npm ci`, Dev-Smoke-Test, Build, Typecheck, Lint und Format-Check erfolgreich |
| P01 | Grundlage | Cloudflare-Laufzeit und Bindings | `NEXT` | – |
| P02 | Grundlage | Authentifizierung und Security-Basis | `PLANNED` | – |
| P03 | Grundlage | Testsystem vervollständigen und CI-Qualitätsgates | `PLANNED` | – |
| P04 | Seiten | D1-Schema und Migrationen | `PLANNED` | – |
| P05 | Seiten | Pages Domain und HTTP-API | `PLANNED` | – |
| P06 | Seiten | App-Shell, Sidebar und Page CRUD | `PLANNED` | – |
| P07 | Navigation | Seitenhierarchie und Sortierung | `PLANNED` | – |
| P08 | Editor | Tiptap-Grundeditor | `PLANNED` | – |
| P09 | Editor | Inhaltsableitungen und Markdown | `PLANNED` | – |
| P10 | Editor | Autosave, Konflikte und Draft Recovery | `PLANNED` | – |
| P11 | Assets | R2 Asset API | `PLANNED` | – |
| P12 | Assets | Screenshot Paste und Drag & Drop | `PLANNED` | – |
| P13 | Assets | Asset-Referenzen und robuste Fehlerpfade | `PLANNED` | – |
| P14 | Suche | D1 FTS5 und Search API | `PLANNED` | – |
| P15 | Suche | Command Palette und Tastenkürzel | `PLANNED` | – |
| P16 | Wiki Links | Wiki Links und Backlinks | `PLANNED` | – |
| P17 | Export | Markdown- und ZIP-Export | `PLANNED` | – |
| P18 | Produktreife | Responsive UI, Dark Mode und Accessibility | `PLANNED` | – |
| P19 | Deployment | Deploy-to-Cloudflare und Version-1-Abnahme | `PLANNED` | – |
| P20 | Post-MVP | Öffentliche Veröffentlichungen | `PLANNED` | – |

## 6. Phasendefinitionen

### Kontext-Routing

Damit ein frischer Chat nicht erneut die gesamte Planung laden muss, gelten diese Lesebereiche:

| Phase | `TECHNICAL_SPEC.md` | `PLAN.md` |
|---|---|---|
| P00 | §§ 2, 3 und 5 | §§ 4, 6 und Phase 0 in § 45 |
| P01 | §§ 3, 4, 12.1 und 13 | §§ 5, 31 und 32 |
| P02 | §§ 4 und 11 | §§ 23, 34, 35 und 37 |
| P03 | § 14 | § 46 |
| P04 | §§ 6 und 12.2 | §§ 7, 11, 12, 17 und 19 |
| P05 | §§ 6.1, 6.4, 7.1, 7.2 und 8.1 | §§ 7, 33–35 und 39 |
| P06 | §§ 5 und 7.2 | §§ 14, 15 und 41 |
| P07 | §§ 6.4 und 7.2 | §§ 7, 14 und Phase 4 in § 45 |
| P08 | § 8.1 | §§ 8, 21, 22 und Phase 2 in § 45 |
| P09 | §§ 6.1 und 8.1 | §§ 7 und 27 |
| P10 | §§ 7.2 und 8.2 | §§ 8, 35 und 36 |
| P11 | §§ 6.2, 7.3, 9.1 und 11.3 | §§ 9–13 und 37–38 |
| P12 | § 9.2 | §§ 9, 10 und Phase 3 in § 45 |
| P13 | §§ 6.2, 8.2 und 9 | §§ 12, 13 und 38 |
| P14 | §§ 6.3, 7.4 und 10 | § 19 und Phase 5 in § 45 |
| P15 | § 10 | §§ 20 und 15 |
| P16 | §§ 6.2 und 17 | §§ 16, 17 und Phase 6 in § 45 |
| P17 | §§ 8.1, 12.2 und 17 | § 27 und Phase 7 in § 45 |
| P18 | §§ 3.2, 14.3 und 16 | §§ 25, 26, 41 und 48 |
| P19 | §§ 11.2, 12 und 17 | §§ 30, 43, 53 und Phase 8 in § 45 |
| P20 | §§ 4, 6.5, 7.1, 11 und 17 | §§ 23, 44 und Public Sharing in § 50 |

Zusätzlich wird nur der für die Phase relevante bestehende Code gelesen. Falls eine referenzierte Entscheidung widersprüchlich oder unvollständig ist, wird die Abweichung vor der Implementierung dokumentiert.

### P00 – Projekt-Scaffold

**Ziel:** Ein minimales, lokal startbares npm-/TypeScript-/React-Projekt als belastbare Basis.

**Scope:**

- npm-Projekt mit `package-lock.json`
- React, Vite und TypeScript im Strict Mode
- Verzeichnisstruktur aus der technischen Spezifikation
- minimale App-Shell ohne Produktfeatures
- ESLint und Formatter
- Basis-Skripte für `dev`, `build`, `typecheck`, `lint` und `format:check`
- `.gitignore`, `.editorconfig` und kurze lokale Startanleitung

**Akzeptanzkriterien:**

- `npm ci` funktioniert auf einem frischen Checkout.
- `npm run dev` zeigt eine minimale Dovari-App.
- `npm run build`, `npm run typecheck`, `npm run lint` und `npm run format:check` sind erfolgreich.
- Client-, Worker- und Shared-Grenzen sind in der Struktur vorbereitet; P01-Inhalte werden noch nicht implementiert.

**Nicht Teil dieser Phase:** Cloudflare-Bindings, Hono-Routen, D1-Schema, Tiptap, Produk UI.

### P01 – Cloudflare-Laufzeit und Bindings

**Ziel:** SPA und Worker laufen gemeinsam in der offiziellen Cloudflare-Vite-Umgebung.

**Scope:**

- `@cloudflare/vite-plugin`, Wrangler und Hono
- Worker-Entrypoint unter `src/worker/`
- Static-Assets-Binding `STATIC_ASSETS`
- D1-Binding `DB` und R2-Binding `ASSETS`
- SPA-Fallback, Worker-first-Routing und zentrale Klassifikation privater, öffentlicher und unbekannter Pfade
- typisierte, von Wrangler erzeugte Bindings
- `/api/health` mit generischem Liveness-Response
- lokale `.dev.vars.example`

**Akzeptanzkriterien:**

- SPA und `/api/health` laufen über denselben lokalen Worker.
- D1 und R2 sind lokal gebunden und über einen nicht-sensitiven Smoke-Test erreichbar.
- `vite build` erzeugt ein deploybares Worker-/Asset-Artefakt.
- Produktion greift nicht versehentlich auf lokale oder Remote-Entwicklungsdaten zu.

**Nicht Teil dieser Phase:** fachliches D1-Schema, Access-JWT-Validierung, CRUD.

### P02 – Authentifizierung und Security-Basis

**Ziel:** Die Anwendung ist in Produktion fail-closed und besitzt zentrale Sicherheitsmiddleware.

**Scope:**

- Cloudflare-Access-JWT-Prüfung einschließlich Signatur, Issuer und Audience
- Access-Schutz für `/app/*` und `/api/private/*`; keine globale Login-Pflicht für reservierte Public-Read-Routes
- Editoren über konkrete Access-Allow-Policies; GitHub optional als Access-Identity-Provider, nicht als eigener Dovari-OAuth-Stack
- sichere lokale Auth-Ausnahme ausschließlich für Loopback-Hosts
- `SETUP_REQUIRED` bei fehlender Produktionskonfiguration
- Origin-Prüfung für Mutationen
- Request-ID und einheitliches API-Fehlerformat
- Basis-Sicherheitsheader und keine sensiblen Standardlogs
- Dokumentation des manuellen Access-Setups
- minimale Worker-Vitest-Konfiguration für die Sicherheitsfälle dieser Phase

**Akzeptanzkriterien:**

- fehlende, ungültige und falsch adressierte Tokens werden abgelehnt.
- ein gültiges Token erreicht die privaten Routes.
- ohne Access-Konfiguration werden weder private App-Shell noch Bindungsdaten ausgegeben.
- `/api/health` und inhaltsfreie statische Dateien bleiben erreichbar, geben aber keine privaten Daten preis.
- unbekannte und öffentliche API-Pfade können keine Mutationsservices erreichen.
- lokale Entwicklung bleibt ohne echten Identity Provider möglich.

**Nicht Teil dieser Phase:** eigene Benutzerkonten, Rollen, Access-Provisionierung.

### P03 – Testsystem vervollständigen und CI-Qualitätsgates

**Ziel:** Der in P02 begonnene Worker-Testaufbau wird zu einem vollständigen, produktionsnahen Prüfsystem für alle weiteren Phasen ausgebaut.

**Scope:**

- Vitest 4 und `@cloudflare/vitest-plugin` konsolidieren
- React Testing Library
- Playwright-Grundkonfiguration
- Worker-Test mit lokalen D1-/R2-Bindings
- minimale Client- und E2E-Smoke-Tests
- CI für Format, Lint, Typen, Tests und Produktionsbuild

**Akzeptanzkriterien:**

- `npm test` läuft reproduzierbar in der Workers-Laufzeit.
- ein Test liest/schreibt die lokalen Test-Bindings isoliert.
- ein Browser-Smoke-Test lädt die App.
- sämtliche CI-Gates laufen lokal und in CI erfolgreich.

**Nicht Teil dieser Phase:** fachliche Testfälle späterer Features.

### P04 – D1-Schema und Migrationen

**Ziel:** Das freigegebene relationale Datenmodell ist lokal und remote reproduzierbar.

**Scope:**

- Drizzle ORM und Drizzle Kit
- Tabellen `pages`, `assets`, `page_assets` und `page_links`
- Indizes, Foreign Keys und Constraints aus `TECHNICAL_SPEC.md`
- FTS5-Tabelle und Synchronisationstrigger als Custom SQL
- lokale und Remote-Migrationsskripte
- Fixtures für Tests

**Akzeptanzkriterien:**

- eine leere lokale D1 wird vollständig migriert.
- eine zweite Ausführung ist ohne Schemafehler möglich.
- Foreign-Key- und FTS-Integrity-Tests bestehen.
- Drizzle-Typen stimmen mit den normalen SQL-Tabellen überein.

**Nicht Teil dieser Phase:** API und UI.

### P05 – Pages Domain und HTTP-API

**Ziel:** Seiten können über die spezifizierte API sicher verwaltet werden.

**Scope:**

- Repositories und Services für Pages
- Zod-Verträge unter `src/shared/`
- Listen, Erstellen, Laden, Metadatenänderung, Inhaltsänderung und Soft Delete
- eindeutige Slugs
- serverseitige Plaintext-Ableitung
- optimistische Revisionen und `409 PAGE_CONFLICT`
- Größenlimits und standardisierte Fehler

**Akzeptanzkriterien:**

- Page CRUD ist durch Worker-Integrationstests abgedeckt.
- veraltete Revisionen überschreiben keine Daten.
- ungültiges Tiptap JSON und zu große Inhalte werden verständlich abgewiesen.
- gelöschte Seiten fehlen in normalen Listen und Details.

**Nicht Teil dieser Phase:** Seitenbaum-UI, vollständiger Editor, Move-API.

### P06 – App-Shell, Sidebar und Page CRUD

**Ziel:** Das grundlegende Wiki ist ohne Rich-Text-Editor im Browser bedienbar.

**Scope:**

- React Router und kanonische Page-URLs
- App-Shell und Sidebar
- Seitenliste laden
- Seite erstellen, auswählen, umbenennen und löschen
- verständliche Loading-, Empty- und Error-States
- einfacher Text-/JSON-Platzhalter für Inhalt, kein Tiptap

**Akzeptanzkriterien:**

- der vollständige CRUD-Ablauf funktioniert im Browser.
- Navigation verursacht keinen Full Reload.
- die aktuelle Seite bleibt über Reload adressierbar.
- Client- und E2E-Tests decken den Kernablauf ab.

**Nicht Teil dieser Phase:** Drag & Drop im Baum, Tiptap, Autosave.

### P07 – Seitenhierarchie und Sortierung

**Ziel:** Seiten bilden einen robusten, bedienbaren Baum.

**Scope:**

- Move-API und Zyklusprüfung
- lückenlose Geschwisterpositionen
- einklappbarer Seitenbaum
- Create Child
- Inline Rename
- Drag & Drop für Hierarchie und Reihenfolge

**Akzeptanzkriterien:**

- Seiten lassen sich vor, nach und in andere Seiten verschieben.
- Selbst- und Nachfahrenzyklen werden serverseitig verhindert.
- Reihenfolge bleibt nach Reload stabil.
- Tastaturzugang besitzt eine nutzbare Alternative zum Pointer-Drop.

**Nicht Teil dieser Phase:** Wiki Links und Suche.

### P08 – Tiptap-Grundeditor

**Ziel:** Seiten können mit dem festgelegten WYSIWYG-Grundumfang bearbeitet werden.

**Scope:**

- Tiptap 3 und Extension-Allowlist
- Überschriften, Marks, Listen, Checklisten, Quote, Divider, Links und Codeblöcke
- Placeholder und Editor-Toolbar
- Laden und lokales Bearbeiten von `content_json`
- dokumentnahe Komponentenstruktur

**Akzeptanzkriterien:**

- erlaubte Formatierungen über Tastatur und UI funktionieren.
- vorhandenes JSON wird verlustfrei geladen und wieder serialisiert.
- unbekannte Nodes führen nicht zu Script-/HTML-Ausführung.
- grundlegende Tastatur- und Fokusbedienung ist getestet.

**Nicht Teil dieser Phase:** Autosave, Bilder, Wiki Links, Slash Commands.

### P09 – Inhaltsableitungen und Markdown

**Ziel:** Aus dem kanonischen Editorformat entstehen deterministische Such- und Exportrepräsentationen.

**Scope:**

- serverseitige Tiptap-Schema-Validierung vervollständigen
- deterministische `content_text`-Ableitung
- Tiptap-zu-Markdown-Konverter für alle bisher erlaubten Nodes
- Roundtrip-/Snapshot-Tests
- keine Speicherung von `content_markdown`

**Akzeptanzkriterien:**

- gleiche Eingabe erzeugt immer identischen Plaintext und Markdown.
- Listen, Tasks, Links und Codeblöcke bleiben semantisch erhalten.
- schädliche oder unbekannte Strukturen werden abgewiesen.

**Nicht Teil dieser Phase:** ZIP-Export und Asset-Umschreibung.

### P10 – Autosave, Konflikte und Draft Recovery

**Ziel:** Schreiben funktioniert ohne Speichern-Knopf und ohne stillen Datenverlust.

**Scope:**

- Autosave-Zustandsautomat und 750-ms-Debounce
- genau ein laufender Save pro Seite
- Retry mit Backoff für transiente Fehler
- sichtbare Saving-/Saved-/Failed-/Conflict-States
- `409`-Konfliktoberfläche
- IndexedDB-Drafts und Recovery nach Reload
- Warnung bei unbestätigten Änderungen

**Akzeptanzkriterien:**

- schnelles Tippen verliert keine Zwischenänderung.
- Netzwerkfehler können automatisch und manuell wiederholt werden.
- zwei Tabs überschreiben einander nicht unbemerkt.
- ein Reload mit unbestätigtem Draft bietet Wiederherstellung an.

**Nicht Teil dieser Phase:** echtes Offline Editing oder automatisches Merge.

### P11 – R2 Asset API

**Ziel:** Dateien können sicher in R2 gespeichert und authentifiziert ausgeliefert werden.

**Scope:**

- Streaming-Upload bis 25 MiB
- serverseitige Dateinamen-, Größen-, MIME- und Magic-Byte-Prüfung
- UUID-basierte R2-Keys
- D1-Metadaten und Rollback bei Teilfehlern
- Metadaten-, Content- und Soft-Delete-Endpunkte
- ETag, Conditional Requests, Range und sichere Content-Disposition

**Akzeptanzkriterien:**

- erlaubte Dateien überstehen Upload und Download bytegenau.
- zu große, SVG-/HTML- und falsch deklarierte Dateien werden abgewiesen.
- R2-Objekte besitzen keine öffentliche URL.
- Teilfehler hinterlassen keinen bekannten permanenten inkonsistenten Zustand.

**Nicht Teil dieser Phase:** Editorintegration und physische Garbage Collection.

### P12 – Screenshot Paste und Drag & Drop

**Ziel:** Der zentrale Dovari-Workflow funktioniert im Editor.

**Scope:**

- Tiptap FileHandler für Paste und Drop
- gemeinsame Client-Uploadpipeline
- Upload-Decorations mit Progress, Retry und Remove
- maximal drei parallele Uploads pro Tab
- eigene `assetImage`- und `attachment`-Nodes mit `assetId`
- positionsstabile Einfügung nach asynchronem Upload

**Akzeptanzkriterien:**

- Screenshot erstellen und `Ctrl+V` fügt genau ein Bild ein.
- Drop fügt das Asset an der Zielposition ein.
- Reload zeigt erfolgreiche Bilder über die persistierte Asset-ID.
- Blob-URLs und temporärer Uploadstatus landen nie im gespeicherten JSON.
- Fehler können ohne Inhaltsverlust erneut versucht werden.

**Nicht Teil dieser Phase:** Thumbnails, Bildbearbeitung und Multipart Uploads.

### P13 – Asset-Referenzen und robuste Fehlerpfade

**Ziel:** Dokumente und Assets bleiben bei Änderungen, Export und Fehlern konsistent.

**Scope:**

- `page_assets` beim Speichern atomar ableiten
- entfernte Assets als unreferenziert erkennen, aber nicht physisch löschen
- kaputte oder gelöschte Asset-Referenzen verständlich darstellen
- Upload-/Save-Rennen und Seitenwechsel testen
- Grundlage für spätere Garbage Collection

**Akzeptanzkriterien:**

- Referenztabelle entspricht nach jedem bestätigten Save dem Dokument.
- Entfernen eines Bildes löscht nicht sofort das R2-Objekt.
- fehlende Assets zerstören weder Editor noch Exportvorbereitung.
- kritische Race Conditions besitzen Integration- oder E2E-Tests.

**Nicht Teil dieser Phase:** zeitgesteuerte Garbage Collection.

### P14 – D1 FTS5 und Search API

**Ziel:** Titel und Seiteninhalt werden schnell und sicher gefunden.

**Scope:**

- sichere Tokenisierung und Escaping der Nutzereingabe
- Prefixsuche für das letzte Token
- BM25-Ranking mit Titelgewichtung
- Snippets und Breadcrumb-Daten
- Limitierung und leere Suchzustände
- FTS-Rebuild-/Integrity-Werkzeug

**Akzeptanzkriterien:**

- Insert, Update, Rename und Soft Delete erscheinen korrekt in der Suche.
- Sonderzeichen und FTS-Operatoren verursachen keine SQL-/Syntaxfehler.
- Titeltreffer werden nachvollziehbar bevorzugt.
- typische lokale Suchanfragen erfüllen das Ziel von deutlich unter 100 ms Datenbankzeit.

**Nicht Teil dieser Phase:** Fuzzy oder semantische Suche und Attachment-OCR.

### P15 – Command Palette und Tastenkürzel

**Ziel:** `Ctrl/Cmd+K` ist der schnelle Einstieg für Suche und Navigation.

**Scope:**

- zugänglicher Command-Dialog
- debounced Search-API-Aufrufe
- Tastaturnavigation und Ergebnisöffnung
- Aktionen für neue Seite, Theme und Einstellungen-Platzhalter
- `Ctrl/Cmd+N` für neue Seite

**Akzeptanzkriterien:**

- Palette öffnet plattformgerecht und schließt zuverlässig.
- Suche und Navigation sind vollständig per Tastatur möglich.
- veraltete Netzwerkantworten überschreiben keine neueren Ergebnisse.
- Fokus wird nach dem Schließen sinnvoll wiederhergestellt.

**Nicht Teil dieser Phase:** komplexes Command- oder Plugin-System.

### P16 – Wiki Links und Backlinks

**Ziel:** Seiten können direkt im Editor miteinander verknüpft werden.

**Scope:**

- eigener Wiki-Link-Node
- `[[`-Autocomplete
- vorhandene Seite auswählen oder neue Seite erstellen
- `page_links` atomar aus gespeichertem Inhalt ableiten
- Navigation über Wiki Links
- einfache Backlink-Anzeige

**Akzeptanzkriterien:**

- Wiki Links bleiben bei Umbenennung über die Page-ID stabil.
- ungelöste Links sind sichtbar und können eine Seite erzeugen.
- Backlinks entsprechen nach Änderungen dem gespeicherten Dokument.
- Tastaturbedienung des Autocomplete ist getestet.

**Nicht Teil dieser Phase:** Transclusion oder Graph View.

### P17 – Markdown- und ZIP-Export

**Ziel:** Nutzer können ihre vollständige Knowledge Base in einem offenen Format mitnehmen.

**Scope:**

- deterministische Ordner- und Dateinamen
- Markdown für alle Seiten
- lokale Wiki- und Asset-Links
- Assets aus R2 in ein ZIP streamen
- manifestierte Exportmetadaten
- verständlicher Download- und Fehlerzustand

**Akzeptanzkriterien:**

- ein Export enthält jede aktive Seite und jedes referenzierte Asset.
- Markdown-Links funktionieren nach dem Entpacken lokal.
- Dateinamenskollisionen werden deterministisch gelöst.
- ein Import ist nicht nötig, um die Daten manuell lesen zu können.

**Nicht Teil dieser Phase:** Import, geplante Backups und inkrementelle Exporte.

### P18 – Responsive UI, Dark Mode und Accessibility

**Ziel:** Der vollständige MVP ist auf Desktop und Mobile konsistent und zugänglich.

**Scope:**

- Light, Dark und System Theme
- mobile Sidebar als Drawer
- Fokuszustände, ARIA-Namen und Kontrastprüfung
- Skip Links und logische Tab-Reihenfolge
- Reduced-Motion-Verhalten
- finale Empty-, Loading- und Error-States

**Akzeptanzkriterien:**

- Kernabläufe funktionieren bei Desktop- und Smartphone-Breite.
- automatische Accessibility-Prüfungen melden keine kritischen Fehler.
- alle interaktiven Kernfunktionen sind per Tastatur erreichbar.
- Theme bleibt über Reload stabil und respektiert das System.

**Nicht Teil dieser Phase:** native App oder vollwertige mobile Editing-Optimierung.

### P19 – Deploy-to-Cloudflare und Version-1-Abnahme

**Ziel:** Eine neue Person kann Dovari aus dem öffentlichen Repository sicher installieren.

**Scope:**

- finaler Deploy-Button
- automatische D1-/R2-Provisionierung und Migration im Deploy-Skript
- vollständige README für lokale Entwicklung und Produktion
- geführter Access-Post-Deploy-Schritt für `/app/*` und `/api/private/*`
- Custom-Domain-Hinweise
- frischer Installations-Smoke-Test
- vollständiger kritischer E2E-Durchlauf aus `PLAN.md`

**Akzeptanzkriterien:**

- Installation aus einem frischen Cloudflare-Account ist dokumentiert und getestet.
- ohne Access-Konfiguration bleiben alle privaten Pfade und Schreiboperationen fail-closed.
- nach Setup funktionieren Create, Edit, Screenshot Paste, Autosave, Search, Wiki Link und Export.
- alle CI-Gates und kritischen E2E-Tests sind grün.
- bekannte Einschränkungen sind im README dokumentiert.

**Nicht Teil dieser Phase:** Funktionen aus „Nicht Teil des MVP“ in `PLAN.md`.

### P20 – Öffentliche Veröffentlichungen

**Ziel:** Einzelne Seiten können bewusst als sichere, schreibgeschützte Snapshots veröffentlicht werden, während Entwürfe und Bearbeitung privat bleiben.

**Scope:**

- Tabellen `page_publications` und `publication_assets` als neue Migration
- Publish, Update Publication und Unpublish ausschließlich über `/api/private/*`
- bereinigter Snapshot statt Live-Freigabe des aktuellen Seitendokuments
- öffentliche Seite unter `/p/:publicId`
- strikt lesende Endpunkte unter `/api/public/*`
- öffentliche Asset-Auslieferung nur bei Referenz durch die konkrete Publication
- Behandlung privater Wiki Links, fehlender Assets und unveröffentlichter eingebetteter Inhalte
- Option zur Suchmaschinenindexierung pro Publication
- Tests der vollständigen Private-/Public-Routing-Matrix

**Akzeptanzkriterien:**

- nur ein berechtigter Editor kann veröffentlichen, aktualisieren oder zurückziehen.
- Änderungen am privaten Entwurf werden nicht ohne erneutes Publish öffentlich.
- eine öffentliche URL funktioniert ohne Login und ermöglicht keinerlei Mutation.
- private Seiten, Backlinks, Metadaten und nicht veröffentlichte Assets lassen sich über Public-Routes nicht ermitteln.
- Unpublish macht Snapshot und zugehörige öffentliche Asset-Routen unmittelbar unerreichbar.
- alle bisherigen privaten Authentifizierungs- und Editorabläufe bleiben unverändert geschützt.

**Nicht Teil dieser Phase:** öffentliche Bearbeitung, Kommentare, Teams, Rollen, Custom Sharing ACLs oder passwortgeschützte Links.

## 7. Entdeckte Folgearbeit

Hier werden während einer Phase gefundene Aufgaben notiert, die nicht zu ihrem Scope gehören. Beim Abschluss einer Phase muss jeder Eintrag entweder einer späteren Phase zugeordnet oder ausdrücklich verworfen werden.

| ID | Entdeckt in | Beschreibung | Zielphase | Status |
|---|---|---|---|---|
| – | – | Noch keine Folgearbeit erfasst | – | – |

## 8. Kurzprotokoll

Das Kurzprotokoll bleibt bewusst knapp. Pro abgeschlossener oder blockierter Phase gibt es höchstens einen Eintrag; ausführliche Begründungen gehören in Code, Tests oder ADRs.

| Datum | Phase | Ergebnis | Verifikation | Hinweise |
|---|---|---|---|---|
| 2026-09-12 | P00 | React-/Vite-/TypeScript-Scaffold mit minimaler Dovari-App-Shell und vorbereiteten Client-/Worker-/Shared-Grenzen umgesetzt | `npm ci --ignore-scripts --no-audit --no-fund`, Dev-Server plus HTTP-Smoke-Test, `npm run build`, `npm run typecheck`, `npm run lint` und `npm run format:check` erfolgreich | Cloudflare-Bindings, Hono-Routing und Produktfeatures bleiben P01 bzw. späteren Phasen vorbehalten; P01 ist `NEXT` |

## 9. Regeln zur Pflege dieses Dokuments

- Der Kopf und die Statustabelle müssen immer denselben Stand zeigen.
- Es darf höchstens eine `IN PROGRESS`-Phase und höchstens eine `NEXT`-Phase geben.
- Solange eine Phase `IN PROGRESS` oder `BLOCKED` ist, wird keine spätere Phase als `NEXT` markiert.
- Akzeptanzkriterien werden nicht nachträglich abgeschwächt, nur um eine Phase abzuschließen.
- Wird der Plan fachlich geändert, werden zuerst `PLAN.md` oder `TECHNICAL_SPEC.md` angepasst und anschließend die betroffenen Phasen hier aktualisiert.
- Datumsangaben verwenden `YYYY-MM-DD`.
- Das Dokument wird mit jeder Phase committed beziehungsweise zusammen mit deren Änderungen gespeichert; eine Statusänderung ohne zugehörige Implementierung ist unzulässig.
