# Architecture Research

**Domain:** Documentation Intelligence Platform — Bidirectional Sync + Dashboard Milestone
**Researched:** 2026-03-16
**Confidence:** HIGH (codebase inspected directly; patterns verified against Express and chokidar official docs)

---

## Context: What This Milestone Adds

The existing system (analyzed as DocuMind v2.0/v3.0 in prior research) already has:

- `daemon/watcher.mjs` — chokidar file watcher, detects `.md` changes, queues events with 5s debounce
- `daemon/hooks.mjs` — routes post-write/post-commit/diagram-curated events
- `processors/relink-processor.mjs` — bidirectional sync between `DIAGRAM-REGISTRY.md` and the `diagrams` table (fully working)
- `daemon/server.mjs` — Express :9000 with 14+ REST endpoints; `GET /stats`, `GET /diagrams`, etc. already return JSON

What is missing:

- Watcher's `processPendingChanges()` has `// TODO` stubs — it logs but does not invoke any processor
- Hooks have `// TODO` stubs for post-write re-indexing, batch re-index, scan, and convert events
- No notification mechanism exists (neither console summary, PM2 log-based, nor HTTP push)
- No web dashboard (deferred in PROJECT.md — may be added this milestone for demo purposes)

This architecture document describes the component model and data flow for completing those pieces.

---

## Standard Architecture

### System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          INBOUND CHANGE SOURCES                          │
│  ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────────┐  │
│  │  File System     │  │  Claude Code Hook  │  │  HTTP POST /scan    │  │
│  │  (14 repos,      │  │  POST /hook        │  │  or /index          │  │
│  │  chokidar watch) │  │  post-write /      │  │  manual trigger     │  │
│  └────────┬─────────┘  │  post-commit /     │  └─────────┬───────────┘  │
│           │            │  diagram-curated   │            │              │
│           │            └─────────┬──────────┘            │              │
│           │                      │                        │              │
├───────────┴──────────────────────┴────────────────────────┴─────────────┤
│                          EVENT ROUTER LAYER                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  daemon/watcher.mjs              daemon/hooks.mjs               │    │
│  │  chokidar → debounce(5s)         event type routing             │    │
│  │  → processPendingChanges()  →    dispatches by ext + event type │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                              │                                           │
├──────────────────────────────┴───────────────────────────────────────────┤
│                          PROCESSING LAYER                                │
│  ┌────────────────┐  ┌──────────────────┐  ┌───────────────────────┐    │
│  │  markdown-     │  │  relink-         │  │  graph/relations.mjs  │    │
│  │  processor.mjs │  │  processor.mjs   │  │  buildRelationships() │    │
│  │  parse+lint+   │  │  registry→DB     │  │  doc graph rebuild    │    │
│  │  FTS-index     │  │  DB→registry     │  │  (full scan only)     │    │
│  └────────┬───────┘  └────────┬─────────┘  └──────────────────────┘    │
│           │                   │                                          │
├───────────┴───────────────────┴──────────────────────────────────────────┤
│                          DATABASE LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  SQLite documind.db (WAL, FTS5)                                  │    │
│  │  documents · diagrams · keywords · doc_relationships · ...       │    │
│  └──────────────────────────────────┬──────────────────────────────┘    │
│                                      │                                   │
├──────────────────────────────────────┴───────────────────────────────────┤
│                          OUTPUT / CONSUMER LAYER                         │
│  ┌────────────────────┐  ┌───────────────────┐  ┌─────────────────────┐ │
│  │  DIAGRAM-REGISTRY  │  │  Express :9000     │  │  Notification       │ │
│  │  .md files (per    │  │  JSON API          │  │  (PM2 logs,         │ │
│  │  repo)             │  │  + static HTML     │  │  console summary,   │ │
│  │  written by sync   │  │  dashboard         │  │  or POST webhook)   │ │
│  └────────────────────┘  └───────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
| ----------- | --------------- | ------------------- |
| `daemon/watcher.mjs` | chokidar file events → debounced batch → `processPendingChanges()` | Dispatch to processors by file extension |
| `daemon/hooks.mjs` | Route Claude Code events (post-write, post-commit, diagram-curated) to handlers | processors, DB |
| `daemon/server.mjs` | Express :9000; REST endpoints for JSON + optional static HTML dashboard | DB, processors, orchestrator |
| `daemon/scheduler.mjs` | node-cron periodic triggers for scan, keyword refresh, relink check | orchestrator (via TODO stubs being replaced) |
| `processors/markdown-processor.mjs` | Parse frontmatter + body, lint, SHA256 hash, upsert `documents`, update FTS5 | DB |
| `processors/relink-processor.mjs` | DB→registry sync (`syncRegistryFromDb`), registry→DB sync (`reverseSyncFromRegistry`), URL propagation (`propagateRelinkAllRepos`) | DB, filesystem (14 repos) |
| `graph/relations.mjs` | Build edges in `doc_relationships` from link patterns, dispatch patterns, supersedes patterns | DB |
| `orchestrator.mjs` (NEW/PENDING) | Single wiring layer: sequences processor calls for scan, index, keyword, graph operations | All processors, DB |
| `notifier.mjs` (NEW) | Emit sync result summaries — console/log output after watcher batch completion; optional webhook | console.error, optional HTTP POST |
| `public/` (NEW — if dashboard added) | Static HTML + JS for dashboard; served by Express `express.static` | None (browser fetches `/stats`, `/diagrams`, etc.) |

---

## Bidirectional Sync Architecture

This is the central design problem of the milestone. The system must handle two sync directions safely:

### Direction A: File → Database (Inbound Sync)

Triggered by: chokidar `change`/`add` event on a `.md` file, or Claude Code `post-write`/`post-commit` hook.

```text
File event (add or change on DIAGRAM-REGISTRY.md or any .md)
    ↓
watcher.mjs queues change in pendingChanges Set (JSON-stringified path + event)
    ↓
debounceTimer fires after 5s of quiet (avoids rapid-fire on bulk git operations)
    ↓
processPendingChanges() iterates batch:
  for each .md file:
    → call markdown-processor: parse, hash, lint, upsert documents table, update FTS5
    if file is DIAGRAM-REGISTRY.md:
      → call reverseSyncFromRegistry(db, repo, repoPath)
        → parseRegistryMarkdown(): extract rows from 7-column table
        → for each row: UPDATE diagrams SET curated_url WHERE name = ?
                         INSERT diagrams if name not found
        → return { synced, created, updated }
    ↓
  for each deleted file (unlink):
    → DELETE FROM documents WHERE path = ?
    ↓
notifier.mjs: emit batch summary to console.error / log
```

**Key constraint:** `DIAGRAM-REGISTRY.md` is a regular markdown file watched by chokidar, so any manual edit to the registry file triggers the registry→DB sync path automatically. No separate watch pattern is needed.

### Direction B: Database → File (Outbound Sync)

Triggered by: `POST /diagrams/sync-registry`, `POST /diagrams/relink`, `POST /diagrams/bulk-relink`, or the scheduler's 6-hour relink check.

```text
DB state changes (curated_url set on a diagram row)
    ↓
relink-processor.syncRegistryFromDb(db, repository, repoPath):
    → SELECT * FROM diagrams WHERE repository = ?
    → map rows to RegistryRow objects (name, mmd, png, generatedUrl, curatedUrl, status, updated)
    → writeRegistryMarkdown(registryPath, rows, header)
       writes 7-column table to docs/diagrams/DIAGRAM-REGISTRY.md
    ↓
watcher detects the file was written
    → debounce queues DIAGRAM-REGISTRY.md as a change
    → processPendingChanges fires: calls reverseSyncFromRegistry again
    → reverseSyncFromRegistry reads rows back and compares to DB — no-op if identical
```

**Critical design point — preventing write loops:** When DB→File sync writes `DIAGRAM-REGISTRY.md`, the watcher detects the file change and triggers File→DB sync. This must not cause an infinite loop. The prevention is idempotency: `reverseSyncFromRegistry` uses `UPDATE diagrams SET curated_url = CASE WHEN ? != '' THEN ? ELSE curated_url END` — if the value written matches what's already in DB, no change occurs. The watcher still fires, the processor still runs, but the DB write is a no-op.

**Simpler alternative if loops become a problem:** Track a `_syncInProgress` Set by repository name in the watcher. Set it before outbound sync, clear after write completes. In `processPendingChanges`, skip `reverseSyncFromRegistry` if repository is in `_syncInProgress`. This is an optimization — not required if idempotency is sufficient.

### Conflict Resolution Policy

| Conflict Scenario | Policy |
| ------------------- | -------- |
| File has curated URL not in DB | File wins — `reverseSyncFromRegistry` upserts it |
| DB has curated URL, file has empty | DB wins — `syncRegistryFromDb` overwrites file row |
| Both have different curated URLs | DB wins if `curated_at` timestamp is newer; file wins if `curated_at` is null (not yet set from DB side) |
| File deleted (repo removed from scan) | DB record retained; file column cleared on next `syncRegistryFromDb` |

## File Watching → Parse → DB Sync Pipeline

### Detailed Data Flow

```text
Stage 1: Detection
  chokidar 'change' event fires for /path/to/repo/docs/diagrams/DIAGRAM-REGISTRY.md
  └─ awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }
     ensures file write is complete before event fires (already configured in watcher.mjs)

Stage 2: Debounce + Queue
  pendingChanges.add(JSON.stringify({ path, event }))
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(processPendingChanges, 5000)
  └─ 5s window collapses burst changes (e.g., git checkout 20 files) into one batch

Stage 3: Batch Processing
  processPendingChanges(db):
    changes = [...pendingChanges].map(JSON.parse)
    pendingChanges.clear()
    for each change:
      if event === 'unlink': DELETE FROM documents WHERE path = ?; continue
      ext = path.extname(change.path).toLowerCase()
      switch ext:
        case '.md':
          await markdownProcessor.indexFile(db, change.path, repoName)
          if isRegistryFile(change.path):
            await reverseSyncFromRegistry(db, repoName, repoPath)
        case '.pdf':
          await pdfProcessor.process(db, change.path)
        case '.docx', '.rtf':
          await wordProcessor.convert(db, change.path)

Stage 4: Notification
  notifier.emit({
    processed: changes.length,
    indexed: mdCount,
    synced: registryCount,
    errors: errorList
  })
  → console.error(`[watcher] Batch complete: ${mdCount} indexed, ${registryCount} registry synced`)
  → optional: POST to webhook URL if configured in context profile
```

### Propagation: URL Change Across All Repos

When a diagram is relinked (curated URL set), the old URL must be replaced across all 14 repositories' markdown files.

```text
POST /diagrams/relink { name, curatedUrl }
    ↓
relinkDiagram(db, name, curatedUrl)
    → SELECT id, figjam_url FROM diagrams WHERE name = ?
    → UPDATE diagrams SET curated_url = ?, curated_at = ? WHERE id = ?
    → returns { id, oldUrl }
    ↓
if oldUrl exists:
    propagateRelinkAllRepos(db, oldUrl, curatedUrl, registryPath)
        → read repository-registry.json (list of 14 active repos)
        → for each active repo:
            walkAndReplace(repoPath, oldUrl, curatedUrl, modified[])
            → recursive fs.readdir → find .md files containing oldUrl
            → fs.writeFile with replaceAll(oldUrl, curatedUrl)
        → returns { repoName: [modified files] }
    ↓
response includes { diagram, oldUrl, curatedUrl, propagated }
    ↓
watcher detects modified .md files in each repo
    → re-indexes them (markdown-processor upsert)
    → NOT a registry sync trigger (only DIAGRAM-REGISTRY.md triggers registry sync)
```

**Performance note:** `propagateRelinkAllRepos` is already implemented in `relink-processor.mjs` and walks all 14 repos sequentially. For the current scale (< 1000 files per repo), this takes 2-10 seconds. No parallelism needed.

## Web Dashboard Integration with Express

### Architecture Decision: Static HTML Served by Same Express Instance

**Why this is correct:** The existing `daemon/server.mjs` is a PM2-managed, long-running Express process. A dashboard that polls `localhost:9000` for data has zero additional infrastructure — no separate server, no CORS, no auth complexity. `express.static()` serves the HTML/CSS/JS files; the same API endpoints the dashboard calls already exist.

**Why not a separate React SPA or build step:** The dashboard is a "demo surface" (PROJECT.md notes it was deferred and may return for Step #3). A lightweight HTML+vanilla JS approach avoids a build pipeline, node_modules sprawl, and hot-reload tooling in a daemon project. The dashboard can be replaced with a proper SPA if/when needed.

### Server Integration Pattern

```javascript
// daemon/server.mjs — additions only
import path from 'path';

// Serve dashboard static assets
app.use('/dashboard', express.static(path.join(ROOT, 'public')));

// Dashboard SPA fallback (if using client-side routing)
app.get('/dashboard/*', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public/index.html'));
});

// All existing /stats, /diagrams, /search endpoints unchanged
// Dashboard fetches them via fetch('/stats') etc.
```

### Dashboard Component Boundaries

| Component | What it does | Data source |
| ----------- | ------------- | ------------- |
| `public/index.html` | Entry point, layout structure | static |
| `public/app.js` | Fetch + render logic; polls `/stats` every 30s | `GET /stats` |
| `public/diagrams.js` | Diagram list with curated/pending status | `GET /diagrams`, `GET /diagrams/pending-relinks` |
| `public/sync.js` | Trigger sync operations; show result | `POST /diagrams/sync-registry`, `POST /diagrams/reverse-sync` |
| `public/styles.css` | Minimal styling | static |

### Dashboard Data Flow

```text
Browser loads /dashboard
    ↓
app.js: fetch('/stats') → render totals (documents, repos, pending_relinks, last_scan)
app.js: setInterval(refresh, 30000) → poll /stats every 30s
    ↓
User clicks "Sync Registry" for a repo
    → fetch POST /diagrams/sync-registry { repository, repoPath }
    → show spinner
    → on response: refresh /diagrams list
    ↓
User sets curated URL for a diagram
    → fetch POST /diagrams/relink { name, curatedUrl }
    → on response: show propagated repo count
    → refresh pending-relinks count in /stats
```

### JSON API Design Constraint

The same JSON responses consumed by the dashboard must also be consumable by MCP tools. This means:

- Response shapes must not include HTML fragments or template strings
- All date fields must be ISO 8601 strings (not `Date` objects)
- Counts must be top-level fields alongside arrays (so MCP tools can get count without parsing the array)
- Error responses must be `{ error: string }` — consistent with existing endpoints

The existing endpoints (`/stats`, `/diagrams`, `/diagrams/pending-relinks`) already follow this pattern. New dashboard-specific endpoints (if any) must match.

## Notification Architecture

### What "Notification" Means in This Context

For a solo-user daemon, notification means:
1. **Console/log summary after every watcher batch** — already partially there (`console.log` calls in watcher); needs structured output
2. **Scheduler summary** — 6-hour relink check already logs to console; needs to be surfaced more visibly
3. **Optional: PM2 log grep** — PM2 captures all stdout/stderr; `pm2 logs documind-http | grep '[watcher]'` is an adequate notification mechanism for solo use

For multi-user or CI use, notification means:
4. **Webhook call** — POST to a configured URL with the batch result payload
5. **SSE (Server-Sent Events)** — stream real-time watcher events to the dashboard

### Recommended Notification Implementation (Solo Use)

```javascript
// daemon/notifier.mjs — new file
export function emitBatchResult({ processed, indexed, synced, errors, durationMs }) {
  const ts = new Date().toISOString();
  // Always use console.error so MCP process (if sharing module) doesn't corrupt stdout
  console.error(
    `[watcher] ${ts} — batch: ${processed} files, ${indexed} indexed, ${synced} registry synced` +
    (errors.length ? `, ${errors.length} error(s)` : '') +
    ` (${durationMs}ms)`
  );

  // Optionally write to a structured log file for dashboard polling
  // fs.appendFileSync(logPath, JSON.stringify({ ts, ...stats }) + '\n')
}

export async function emitWebhook(url, payload) {
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify(payload) });
  } catch (err) {
    console.error('[notifier] webhook failed:', err.message);
  }
}
```

### SSE for Real-Time Dashboard Updates (Optional Enhancement)

If the dashboard needs real-time updates without polling:

```javascript
// In server.mjs
import { EventEmitter } from 'events';
export const syncEvents = new EventEmitter();

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const handler = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  syncEvents.on('sync-complete', handler);
  req.on('close', () => syncEvents.off('sync-complete', handler));
});

// In watcher.mjs, after processPendingChanges:
import { syncEvents } from './server.mjs'; // circular import risk — pass via callback instead
syncEvents.emit('sync-complete', { indexed, synced });
```

**Caution on SSE:** Circular imports between `server.mjs` and `watcher.mjs` are a risk. Prefer passing a callback from server to watcher at initialization time rather than importing `syncEvents` from server in the watcher.

## Recommended Project Structure (Additions for This Milestone)

```text
DocuMind/
├── daemon/
│   ├── server.mjs          # Existing — add express.static('/dashboard') mount
│   ├── watcher.mjs         # Existing — fill processPendingChanges() TODOs
│   ├── hooks.mjs           # Existing — fill post-write/post-commit TODOs
│   ├── scheduler.mjs       # Existing — TODO stubs remain until orchestrator phase
│   └── notifier.mjs        # NEW — emitBatchResult(), emitWebhook()
├── processors/
│   ├── markdown-processor.mjs  # Existing — expose indexFile(db, filePath, repo)
│   ├── relink-processor.mjs    # Existing — bidirectional sync fully implemented
│   └── ...
├── public/                 # NEW — dashboard static files (if dashboard added)
│   ├── index.html
│   ├── app.js
│   ├── diagrams.js
│   └── styles.css
├── orchestrator.mjs        # PENDING (next milestone) — not needed to complete watcher wiring
└── ...
```

### Structure Rationale

- `daemon/notifier.mjs` is separate from `watcher.mjs` and `hooks.mjs` so both can import it without coupling to each other. It has no dependencies on Express or DB.
- `public/` is flat (not `src/` with a build step) because the dashboard is a demo surface, not a production app. Vanilla fetch + DOM manipulation; no framework.
- `orchestrator.mjs` is explicitly NOT included in this milestone's scope — the watcher can import processors directly. The orchestrator is a next-milestone concern once all scan entry points need to share logic.

## Architectural Patterns

### Pattern 1: Debounce Queue for File Watch Events

**What:** Collect all file events in a `Set` over a time window, then process them as a batch when the window expires with no new events.

**When to use:** Always for file watcher events. Bulk git operations (checkout, rebase, merge) can emit 50-200 file events in rapid succession. Without debouncing, each event independently triggers DB writes and FTS5 updates — expensive and redundant.

**Trade-offs:** 5-second delay between file save and DB index update. Acceptable for a background daemon. Reduce to 1-2s if lower latency is needed. Do not reduce below 1s — file write stabilization (`awaitWriteFinish` threshold is 2s) must complete first.

**Already implemented** in `watcher.mjs`. The TODO is the processor invocations inside `processPendingChanges()`, not the debounce mechanism.

### Pattern 2: Idempotent Upsert for Bidirectional Sync

**What:** All DB writes from both sync directions use `INSERT OR IGNORE` / `ON CONFLICT DO UPDATE` / `UPDATE ... SET col = CASE WHEN ... THEN ... ELSE col END` patterns. No write fails if data already matches.

**When to use:** Mandatory for any pipeline where the same data can arrive from two directions (file-first or DB-first). Without idempotency, the watcher's re-trigger loop causes data corruption or infinite loops.

**Trade-offs:** Slightly more complex SQL, but eliminates the need for a "sync lock" mechanism.

**Already implemented** in `reverseSyncFromRegistry` — the `UPDATE diagrams SET curated_url = CASE WHEN ? != '' THEN ? ELSE curated_url END` pattern is correct.

### Pattern 3: Express Serving Both JSON API and Static Dashboard

**What:** A single Express instance serves JSON API endpoints (`/stats`, `/diagrams`, etc.) and a static HTML dashboard (`/dashboard`). No separate dashboard server or reverse proxy.

**When to use:** Internal tools where the daemon is already the single process. The dashboard calls the API on the same host and port — no CORS, no authentication duplication, no second service to manage.

**Trade-offs:** Dashboard is collocated with the API — a slow dashboard render does not affect API performance (dashboard is static file serving, not server-side rendering). A real-time dashboard would need SSE or WebSocket, which adds a small persistent connection cost. Acceptable for solo use with < 5 concurrent browser tabs.

**Key implementation point:** `express.static()` must be mounted BEFORE API routes that might match the same path, or after with a specific prefix like `/dashboard`. Use a prefix:

```javascript
app.use('/dashboard', express.static(path.join(ROOT, 'public')));
```

This avoids any path collision with `/stats`, `/search`, etc.

## Data Flow

### Complete Bidirectional Sync Flow

```text
INBOUND (File → DB):

User edits DIAGRAM-REGISTRY.md in RootDispatcher repo
    ↓
chokidar detects 'change' event (after 2s write stabilization)
    ↓
debounce queues change; 5s timer resets
    ↓
processPendingChanges() fires
    ↓
markdown-processor.indexFile(db, filePath, 'RootDispatcher')
    → parse frontmatter (gray-matter)
    → compute SHA256 hash of content
    → lint with markdownlint
    → UPSERT documents (id, path, content_hash, content, ...)
    → FTS5 trigger fires automatically (via SQL trigger)
    ↓
isRegistryFile() check → true for DIAGRAM-REGISTRY.md
    ↓
reverseSyncFromRegistry(db, 'RootDispatcher', '/path/to/RootDispatcher')
    → parseRegistryMarkdown('/path/to/RootDispatcher/docs/diagrams/DIAGRAM-REGISTRY.md')
    → for each row: UPDATE diagrams SET curated_url WHERE name = ?
                    INSERT diagrams if name not found
    → return { synced: N, created: M, updated: K }
    ↓
notifier.emitBatchResult({ processed, indexed, synced, durationMs })

OUTBOUND (DB → File + Propagation):

POST /diagrams/relink { name: 'auth-flow', curatedUrl: 'https://figma.com/board/...' }
    ↓
relinkDiagram(db, 'auth-flow', curatedUrl)
    → UPDATE diagrams SET curated_url = ?, curated_at = ? WHERE name = 'auth-flow'
    → returns { id, oldUrl: 'https://old-figma-url' }
    ↓
syncRegistryFromDb(db, repository, repoPath)   [optional — called by scheduler or explicit]
    → SELECT * FROM diagrams WHERE repository = 'RootDispatcher'
    → writeRegistryMarkdown(registryPath, rows)
    → file written → watcher fires → reverseSyncFromRegistry runs → no-op (already synced)
    ↓
propagateRelinkAllRepos(db, oldUrl, curatedUrl, registryPath)
    → for each of 14 active repos:
        walkAndReplace(repoPath, oldUrl, curatedUrl, modified[])
    → returns { 'DocuMind': ['docs/foo.md'], 'RootDispatcher': ['dispatches/bar.md'] }
    ↓
Response: { status: 'relinked', diagram, oldUrl, curatedUrl, propagated }
```

### Request Flow — Dashboard

```text
Browser GET /dashboard/index.html
    ↓
express.static serves public/index.html (no DB hit)
    ↓
Browser executes app.js: fetch('/stats')
    ↓
Express GET /stats handler (already implemented in server.mjs)
    → synchronous better-sqlite3 queries (documents count, repos, issues, diagrams, etc.)
    → returns JSON in < 10ms
    ↓
app.js renders counts into DOM
    ↓
setInterval(30s): repeat fetch('/stats')
```

## Suggested Build Order (This Milestone)

Phase ordering for this milestone is driven by what each step depends on:

1. **Fill watcher TODOs first** — `processPendingChanges()` needs to invoke processors. This is the highest-value change: it activates real-time indexing on any file save across all 14 repos. Depends on: `markdown-processor.indexFile()` being importable as a function (may need minor refactoring to expose a named export). The relink path (`reverseSyncFromRegistry`) is already a named export.

2. **Fill hooks TODOs second** — `post-write` and `post-commit` events from Claude Code go through `/hook`. These are the MCP-era equivalent of the watcher — they fire when Claude writes files. Filling these TODOs ensures Claude-written files get indexed immediately without waiting for the next watcher batch. Depends on: same `markdown-processor.indexFile()` export as step 1.

3. **Add notifier third** — `daemon/notifier.mjs` is a new file with no dependencies on anything being built in steps 1-2. It can be written independently. Consuming it from `processPendingChanges()` is a 2-line addition after step 1 is complete.

4. **Dashboard last (if added this milestone)** — The dashboard has no hard dependencies on steps 1-3; it reads existing JSON endpoints. Build it last because it provides zero new data capability — it only visualizes what already exists. It can be omitted from this milestone without affecting any other component.

**Build order summary:**

```text
1. markdown-processor.mjs — expose indexFile(db, filePath, repo) named export
       ↓
2. watcher.mjs processPendingChanges() — call indexFile + reverseSyncFromRegistry
       ↓
3. hooks.mjs post-write/post-commit handlers — call indexFile
       ↓
4. notifier.mjs — emitBatchResult (consumed by watcher + hooks)
       ↓
5. public/ dashboard (optional) — reads existing /stats, /diagrams endpoints
```

## Integration Points

### Watcher → Processors

| Integration | Pattern | Notes |
| ------------- | --------- | ------- |
| `processPendingChanges` → `markdown-processor` | Direct function call (import) | `indexFile(db, filePath, repoName)` — needs to be extracted as named export if not already |
| `processPendingChanges` → `relink-processor.reverseSyncFromRegistry` | Direct function call | Already exported; just call it when file matches `DIAGRAM-REGISTRY.md` pattern |
| `processPendingChanges` → `pdf-processor` | Direct function call | Already has `// TODO` stub — same pattern as markdown |
| `processPendingChanges` → `word-processor` | Direct function call | Already has `// TODO` stub — same pattern as markdown |

### Hooks → Processors

| Integration | Pattern | Notes |
| ------------- | --------- | ------- |
| `post-write` event → `markdown-processor.indexFile` | Direct function call | Single file re-index; immediate, not batched |
| `post-commit` event → batch re-index | Loop over `mdFiles`, call `indexFile` for each | Or queue via watcher if batch size > 10 |
| `diagram-curated` event → `relinkDiagram` + `propagateRelinkAllRepos` | Already implemented in hooks.mjs | Working — no changes needed |

### Express → Dashboard

| Integration | Pattern | Notes |
| ------------- | --------- | ------- |
| `/dashboard` → static files | `express.static('public')` with `/dashboard` prefix | Mount before API routes to avoid path conflicts |
| Dashboard → `/stats` | Browser `fetch('/stats')` | No CORS headers needed (same origin) |
| Dashboard → `/diagrams/pending-relinks` | Browser `fetch` | Existing endpoint |
| Dashboard → `POST /diagrams/relink` | Browser `fetch` with JSON body | Existing endpoint |

### Circular Import Prevention (Server ↔ Watcher)

`daemon/server.mjs` calls `initWatcher(db, ROOT)`. `daemon/watcher.mjs` should NOT import from `daemon/server.mjs`. If the notifier or SSE emitter needs to be shared, pass it as a callback:

```javascript
// server.mjs
const onSyncComplete = (result) => syncEvents.emit('sync-complete', result);
initWatcher(db, ROOT, { onBatchComplete: onSyncComplete });

// watcher.mjs
export function initWatcher(db, root, { onBatchComplete } = {}) {
  // ...
  function processPendingChanges() {
    // ... processing ...
    if (onBatchComplete) onBatchComplete({ indexed, synced });
  }
}
```

## Anti-Patterns

### Anti-Pattern 1: Processing File Events Without Debouncing

**What people do:** Call `indexFile()` directly inside the `watcher.on('change')` callback.

**Why it's wrong:** A `git pull` or `git checkout` across 14 repos emits hundreds of change events in under a second. Each triggers a `better-sqlite3` write. SQLite serializes writes — the queue backs up, the event loop blocks, and the daemon becomes unresponsive.

**Do this instead:** The existing debounce queue in `watcher.mjs` is correct. The fix is to complete `processPendingChanges()`, not to bypass the debounce.

### Anti-Pattern 2: Bidirectional Sync Without Idempotency

**What people do:** Write `UPDATE diagrams SET curated_url = ?` without a `CASE WHEN` guard, and `INSERT INTO diagrams` without `OR IGNORE`.

**Why it's wrong:** When DB→File sync writes `DIAGRAM-REGISTRY.md`, the watcher fires, `reverseSyncFromRegistry` runs, and the plain `UPDATE` overwrites the curated_url with the same value but changes `curated_at` to `now()`. On the next `syncRegistryFromDb` call, the `updated` field in the registry file changes. The watcher fires again. Infinite loop.

**Do this instead:** Use idempotent SQL patterns (already in `reverseSyncFromRegistry`). Never update a timestamp column on a no-op write.

### Anti-Pattern 3: Serving Dashboard HTML from a Separate Port

**What people do:** Start a second `http.createServer()` on port 9001 to serve the dashboard, keeping it "separate from the API."

**Why it's wrong:** DocuMind already has a port registration in RootDispatcher's `port-registry.json`. Adding a second registered port adds ecosystem coordination overhead. The dashboard calls the same API — serving it from the same Express instance on port 9000 under `/dashboard` is zero additional infrastructure.

**Do this instead:** `app.use('/dashboard', express.static(...))` in the existing `server.mjs`. One process, one port.

### Anti-Pattern 4: Embedding Business Logic in the Watcher

**What people do:** Write parsing, hashing, and DB upsert logic directly inside `processPendingChanges()`.

**Why it's wrong:** The watcher is an event routing layer. It must remain thin. If index logic lives in the watcher, the hooks system (`hooks.mjs`) must duplicate it for `post-write` events. The scheduler's full-scan job would also duplicate it.

**Do this instead:** `processPendingChanges()` calls `markdownProcessor.indexFile()`. The indexing logic lives only in `markdown-processor.mjs`. Three callers (watcher, hooks, scheduler) all call the same function.

## Scaling Considerations

This system is a solo-user internal daemon. Scale considerations apply to Step #3 (commercial) only.

| Scale | Architecture Adjustments |
| ------- | -------------------------- |
| Solo use (current) | SQLite WAL, PM2 daemon, debounced watcher — correct and sufficient |
| Team use (5-20 people) | Add auth to Express. Replace SSE EventEmitter with a proper pub/sub (e.g., Redis pub/sub). File watcher becomes irrelevant if team uses hosted repos — switch to webhook-based indexing |
| SaaS (Step #3) | Per-tenant SQLite (Turso) or Postgres. No file watcher — receive webhooks from GitHub/GitLab. Dashboard becomes a proper SPA with auth |

**First bottleneck for this milestone:** The `propagateRelinkAllRepos` walk is sequential across 14 repos. At 14 repos × ~500 .md files each = 7000 files scanned per relink operation. At current scale this is 2-10 seconds — acceptable. If repos grow to 50+, parallelize with `Promise.all()`.

## Sources

- Direct codebase inspection: `daemon/watcher.mjs`, `daemon/hooks.mjs`, `daemon/server.mjs`, `processors/relink-processor.mjs`, `graph/relations.mjs` (HIGH confidence)
- chokidar documentation: `awaitWriteFinish` option and debounce patterns (HIGH confidence — used in existing watcher config)
- Express `express.static()` documentation: path-prefixed static serving (HIGH confidence — official Express 5 docs)
- Express SSE patterns: EventEmitter + `text/event-stream` (MEDIUM confidence — multiple sources agree on pattern)
- Bidirectional sync loop prevention: idempotent SQL CASE WHEN pattern observed in existing `reverseSyncFromRegistry` (HIGH confidence — codebase direct inspection)
- SQLite WAL concurrent access: official SQLite documentation (HIGH confidence)

*Architecture research for: DocuMind — Bidirectional Sync + File Watch Pipeline + Dashboard*
*Researched: 2026-03-16*
*Milestone: Diagram curation workflow — extending existing Express/SQLite daemon*
