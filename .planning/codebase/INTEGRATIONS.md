# External Integrations

**Analysis Date:** 2026-03-15

## APIs & External Services

**None detected** - DocuMind is a self-contained documentation service with no third-party API integrations (Stripe, Supabase, AWS, etc.). All processing is local.

## Data Storage

**Databases:**

- SQLite (local filesystem)
  - Connection: File-based at `data/documind.db` (path configurable via `DOCUMIND_DB` env var)
  - Client: better-sqlite3 (native Node.js bindings, synchronous)
  - Embedded—no remote database connectivity

**File Storage:**

- Local filesystem only
  - Markdown documents: Scanned from 13+ DVWDesign repositories located at `/Users/Shared/htdocs/github/DVWDesign/`
  - Generated diagrams: Written to `data/mermaid/` (Mermaid .mmd files)
  - Logs: Written to `data/logs/` (PM2 error/output logs)
  - Database: `data/documind.db` (SQLite file)

**Caching:**

- Query cache table in SQLite (not external)
- Cache expiry via database trigger auto-cleanup
- No external cache service (Redis, Memcached, etc.)

## Authentication & Identity

**Auth Provider:** None

**Implementation:** Not applicable—DocuMind is an internal service without user authentication. All endpoints are accessible on port 9000 without API keys or authentication headers.

## Monitoring & Observability

**Error Tracking:** None detected

**Logs:**

- PM2 managed logs via ecosystem.config.cjs
- Output files: `data/logs/out.log`, `data/logs/error.log`
- Log date format: `YYYY-MM-DD HH:mm:ss`
- Console logging via `console.log()` in daemon and processors

## CI/CD & Deployment

**Hosting:** Local/On-premise

**Deployment:**

- PM2 daemon mode (persistent background service)
- Start: `npm run daemon:start` (pm2 start ecosystem.config.cjs)
- Manual CLI mode: `npm run daemon:dev` (foreground, development)

**CI Pipeline:** None detected (no GitHub Actions, GitLab CI, or build pipeline configured)

## Environment Configuration

**Required env vars:**

- `PORT` - Express server port (optional, default: 9000)
- `NODE_ENV` - Runtime environment (optional, default: production)
- `DOCUMIND_DB` - SQLite database path (optional, default: `./data/documind.db`)

**Secrets location:**

- Not applicable—no external API secrets or credentials in committed files
- `ecosystem.config.cjs` contains environment variables for daemon configuration

## Webhooks & Callbacks

**Incoming Webhooks:**

- `POST /hook` — Receives events from Claude Code (post-write, post-commit, diagram-curated, scan, convert, stale-check)
  - Event types: `post-write`, `post-commit`, `scan`, `convert`, `diagram-curated`, `stale-check`
  - Payload structure: `{ event, file, repo, files, name, curatedUrl, registryPath }`
  - Handlers: `daemon/hooks.mjs` with hooks registered via Claude Code integration

**Outgoing Webhooks:** None detected

## RootDispatcher Integration

**Incoming (from RootDispatcher):**

- Docker/cloud hosting coordination (pending via port-registry.json)
- Dispatch relationship tracking via `dispatched_to` relationships in `doc_relationships` table

**Outgoing (to RootDispatcher):**

- Registry synchronization: Reads `RootDispatcher/config/repository-registry.json` for multi-repo coordination
- Diagram URL propagation: Updates FigJam links across all 13+ DVWDesign repositories
- Memory file reference: `RootDispatcher/memory/repos/DocuMind.md` (documented in CLAUDE.md)

**Endpoints:**

- `POST /diagrams/sync-registry` — Regenerate `DIAGRAM-REGISTRY.md` for a repository from database state
- `POST /diagrams/bulk-relink` — Update multiple diagram URLs across repos in single batch operation
- `POST /diagrams/reverse-sync` — Parse existing `DIAGRAM-REGISTRY.md` and sync back into database

## Figma Integration

**Service:** Figma (via FigJam)

**Integration points:**

- FigJam diagram generation: Processor generates `.mmd` files, stores URL in `diagrams` table
- Diagram URL storage: `figjam_url` and `curated_url` columns track generated and user-curated URLs
- Curation workflow: Claude Code hook receives `diagram-curated` event with curated URL, updates database and propagates across repos
- Metadata: `figjam_file_key` stores Figma file ID for potential reuse within same project file
- Generator: `@mermaid-js/mermaid-cli` converts `.mmd` to PNG/SVG, integration with Figma MCP pending

**Tables:**

- `diagrams` — Registry of all generated diagrams with FigJam URLs and curation status
- `folder_nodes` — Diagram URLs per folder hierarchy node

**API:**

- `GET /diagrams` — List all diagrams with optional filtering by type/staleness
- `GET /diagrams/pending-relinks` — Diagrams awaiting curation (figjam_url set, curated_url NULL)
- `POST /diagrams/relink` — Set curated URL and propagate across repos
- `POST /diagrams/bulk-relink` — Batch URL updates

## Document Conversion Services

**No external converters used.** All conversions are local:

**DOCX:**

- Tool: mammoth (1.11.0) — DOCX → HTML
- Tool: turndown (7.2.2) — HTML → Markdown
- Result: Markdown file with frontmatter added, indexed into documents table

**RTF:**

- Text extraction only (no dedicated library—content extracted via string parsing)
- Result: Converted to Markdown, indexed

**PDF:**

- Tool: pdf-parse (2.4.5) — PDF text extraction
- Tool: markdown-it (14.0.0) — Content parsing
- Result: Text + metadata extracted, summary generated (first 500 words + headings), indexed as markdown-like document

**Endpoint:**

- `POST /convert` — Queue file conversion (DOCX/RTF/PDF → Markdown)
- Stores conversion audit log in `conversions` table

## GitHub Integration

**Integration points:**

- Repository URLs: Defined in `config/constants.mjs` (`GITHUB_ORG = DESIGN-DVW`)
- Repository scanning: Reads local clones at `/Users/Shared/htdocs/github/DVWDesign/`
- No direct API calls to GitHub (only filesystem reads of cloned repos)

**Active repositories scanned:**

- Aprimo, CampaignManager, DocuMind, Figma-Plug-ins, LibraryAssetManager, RootDispatcher, FigmaDSController, FigmailAPP
- Legacy: GlossiaApp (DVW-Design org)
- Local-only: @figma-agents, @figma-core, @figma-docs, RandD, mjml-dev-mode, mjml-dev-mode-proposal

## Document Relationships & Graph

**Node relationships:**

- 8 edge types: `imports`, `parent_of`, `variant_of`, `supersedes`, `depends_on`, `related_to`, `generated_from`, `dispatched_to`
- Stored in `doc_relationships` table
- Queried via graph view `document_graph`

**API:**

- `GET /graph` — Full relationship graph with optional filtering by repo/type/depth
- Recursive CTE traversal support (depth parameter controls traversal hops)

## Keyword Extraction & Classification

**Engine:** natural.js (8.1.1) — TF-IDF keyword extraction

**Categories:** technology, action, topic

**Tables:**

- `keywords` — Extracted keywords with category and score
- `keywords_fts` — FTS5 index for keyword search

**API:**

- `GET /keywords` — Retrieve keywords with optional filtering by repository/category

## Search Capabilities

**Full-Text Search:** FTS5 (SQLite virtual table)

**Index:** `documents_fts` table (path, filename, category, content columns indexed)

**API:**

- `GET /search?q=<query>` — Full-text search across all documents
  - Optional filters: `repo`, `category`, `limit`
  - Returns: Match snippets with context (snippet() function highlights matches)

## Analytics & Statistics

**Dashboard:** `GET /stats` endpoint returns:

- Document count
- Repository count
- Open linting issues count
- Keyword count
- Diagram count
- Pending relinks count
- Stale diagrams count
- Last scan timestamp
- Uptime

**Tables supporting analytics:**

- `scan_history` — Scan execution metrics (documents found/added/updated/removed, duration, status)
- `content_similarities` — Duplicate/variant detection with similarity scores
- `deviations` — Convention deviation tracking (content_drift, structure_change, rule_violation)
- `linting_issues` — Per-document issue tracking with severity levels

---

---
Integration audit: 2026-03-15
