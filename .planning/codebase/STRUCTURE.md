# Codebase Structure

**Analysis Date:** 2026-03-15

## Directory Layout

```text
DocuMind/
├── daemon/                      # Express HTTP server + scheduler + watcher (PM2-managed)
│   ├── server.mjs              # REST API on port 9000
│   ├── scheduler.mjs           # node-cron task orchestrator
│   ├── watcher.mjs             # chokidar file monitoring
│   └── hooks.mjs               # Claude hook event handlers
├── processors/                 # Document format handlers
│   ├── markdown-processor.mjs   # Parse, lint, index markdown + FTS
│   ├── pdf-processor.mjs       # PDF text extraction + summary
│   ├── word-processor.mjs      # DOCX/RTF to Markdown conversion
│   ├── mermaid-processor.mjs   # .mmd diagram generation + FigJam links
│   ├── tree-processor.mjs      # Folder hierarchy → Mermaid trees
│   ├── keyword-processor.mjs   # TF-IDF extraction + classification
│   └── relink-processor.mjs    # Diagram URL curation + propagation
├── graph/                      # Document relationship engine
│   └── relations.mjs           # Link detection, graph building, recursive CTE queries
├── scripts/                    # CLI batch operations
│   ├── db/
│   │   ├── schema.sql          # Full database schema (v2.0)
│   │   └── init-database.mjs   # DB initialization + migrations
│   ├── scan/                   # Scan-related scripts (enhanced scanner, etc.)
│   ├── scan-all-repos.mjs      # Multi-repo markdown file discovery
│   ├── index-markdown.mjs      # Batch indexing into documents table
│   ├── fix-markdown.mjs        # Auto-fix linting issues + common patterns
│   ├── fix-custom-errors.mjs   # Fix custom error patterns
│   ├── validate-timestamps.mjs # Validate metadata consistency
│   ├── analyze-error-patterns.mjs  # Pattern frequency analysis
│   ├── generate-tree-schema.mjs    # JSON tree schema generation
│   └── watch-and-index.mjs     # Legacy file watcher (use daemon instead)
├── config/                     # Configuration files
│   ├── .markdownlint.json      # Linting rules (MD001, MD003, etc.)
│   ├── .markdown-link-check.json  # Link validation config
│   ├── constants.mjs           # App constants (BASE_PATH, REPOS, etc.)
│   ├── custom-error-patterns.json  # Regex patterns for fix-custom-errors
│   ├── port-registry.json      # Port 9000 registration
│   ├── repo-schema.json        # Repository metadata schema
│   └── rules/                  # Custom markdown rules
├── data/                       # Runtime data + database
│   ├── documind.db             # SQLite database (FTS5 + graph)
│   ├── logs/                   # PM2 daemon logs
│   └── mermaid/                # Generated .mmd diagram files
├── index/                      # Index output files
│   ├── all-markdown-files.json # Scan result (all repos)
│   └── scan-report.md          # Human-readable scan summary
├── docs/                       # Generated documentation
│   ├── 07-api/jsdoc/           # JSDoc API reference
│   └── diagrams/               # Diagram source files
├── .claude/                    # Claude-specific config
│   ├── agents/                 # Agent definitions
│   └── commands/               # Command definitions
├── .planning/codebase/         # GSD codebase analysis docs
├── .husky/                     # Git hooks
├── package.json                # Dependencies + npm scripts
├── ecosystem.config.cjs        # PM2 daemon configuration
├── jsdoc.config.json          # JSDoc generation config
├── CLAUDE.md                   # Project documentation & instructions
└── README.md                   # Setup guide + quick start

```

## Directory Purposes

**daemon/:**

- Purpose: Long-running Express HTTP server with background tasks
- Contains: API endpoint handlers, cron job scheduler, file system watcher, hook event processor
- Key files: `daemon/server.mjs` (main entry, defines all routes)

**processors/:**

- Purpose: Format-specific document enrichment and indexing
- Contains: Format parsers (markdown, PDF, DOCX), extractors (keywords, tree hierarchy), transformation (relink URLs)
- Key files: Each processor is self-contained; markdown-processor.mjs is most frequently used

**graph/:**

- Purpose: Build and query document relationship networks
- Contains: Relationship detection (markdown links, dispatches, supersedes), recursive CTE traversal
- Key files: `graph/relations.mjs` exports buildRelationships() and findRelated()

**scripts/db/:**

- Purpose: Database schema and initialization
- Contains: SQLite table definitions, indexes, triggers, views, FTS virtual table
- Key files: `scripts/db/schema.sql` (20+ tables), `scripts/db/init-database.mjs` (create/migrate)

**scripts/**:

- Purpose: CLI batch operations and analysis
- Contains: Full-repo scanning, batch indexing, markdown fixing, validation, pattern analysis
- Key files: `scan-all-repos.mjs` (entry point for scans), `fix-markdown.mjs` (auto-fixer)

**config/:**

- Purpose: Application configuration and rules
- Contains: Markdown linting rules, link validation, repository registry, custom patterns
- Key files: `.markdownlint.json` (enforced rules), `constants.mjs` (BASE_PATH, REPOS list)

**data/:**

- Purpose: Runtime state and generated artifacts
- Contains: SQLite database file, PM2 logs, generated Mermaid diagrams
- Generated: Yes (documind.db created on first run, mermaid/ populated by tree-processor)
- Committed: No (.gitignore excludes *.db, data/logs/)

**index/:**

- Purpose: Scan output and registry
- Contains: all-markdown-files.json (scan result), scan-report.md (summary)
- Generated: Yes (created by scan-all-repos.mjs)
- Committed: No (.gitignore excludes index/)

**docs/:**

- Purpose: Documentation and diagrams
- Contains: JSDoc API reference (07-api/jsdoc/), diagram sources and outputs (diagrams/)
- Generated: Partial (JSDoc generated by `npm run docs:jsdoc`, diagrams by mermaid-processor)

## Key File Locations

**Entry Points:**

- `daemon/server.mjs`: Express app, REST API on port 9000
- `scripts/scan-all-repos.mjs`: CLI scan entry point (discovers all markdown in 14+ repos)
- `scripts/fix-markdown.mjs`: CLI auto-fixer (applies linting fixes)

**Configuration:**

- `package.json`: npm scripts, dependencies, version (2.0.0)
- `ecosystem.config.cjs`: PM2 daemon config (port 9000, logs location)
- `config/.markdownlint.json`: Markdown rules (MD001, MD003, MD022, MD031, MD032, MD040)
- `config/constants.mjs`: BASE_PATH, REPOS list, EXCLUDE_PATTERNS

**Core Logic:**

- `daemon/scheduler.mjs`: Cron job definitions (15-min heartbeat, hourly scan, daily analysis, weekly deep scan)
- `graph/relations.mjs`: Relationship detection and recursive queries
- `processors/markdown-processor.mjs`: Document parsing, FTS indexing pipeline
- `processors/relink-processor.mjs`: Diagram URL propagation across repos

**Database:**

- `scripts/db/schema.sql`: Full schema (documents, relationships, keywords, diagrams, scan_history, etc.)
- `data/documind.db`: SQLite file (created by init-database.mjs)

**Testing:**

- Not applicable (no test files detected; this is a production daemon)

## Naming Conventions

**Files:**

- `.mjs`: All source files use ES modules
- `*-processor.mjs`: Format handlers (markdown-, pdf-, word-, keyword-, tree-, mermaid-, relink-)
- `schema.sql`: Database schema (SQL)
- `init-database.mjs`: DB initialization script
- `*.config.cjs`: Configuration (CommonJS for compatibility)

**Directories:**

- `daemon/`: Background services
- `processors/`: Format-specific modules
- `graph/`: Relationship engine
- `scripts/`: CLI batch operations
- `config/`: Configuration files and constants
- `data/`: Runtime artifacts and database
- `docs/`: Generated documentation

**Functions:**

- `process[Format]()`: Async processor entry (processMarkdown, processWord, etc.)
- `index[Type]()`: Index into database (indexMarkdown)
- `detect[Feature]()`: Analysis detection (detectCategory)
- `build[Structure]()`: Build data structure (buildRelationships)
- `find[Query]()`: Graph queries (findRelated)
- `propagate[Operation]()`: Cross-repo sync (propagateRelink)

**Database:**

- Table names: `documents`, `doc_relationships`, `keywords`, `diagrams`, `scan_history`, `linting_issues`, `content_similarities`, `deviations`
- View names: `document_graph`, `pending_relinks`, `stale_diagrams`, `documents_with_issues`, `similar_pairs`, `canonical_overview`
- Index names: `idx_[table]_[column]` (e.g., `idx_documents_repo`, `idx_documents_hash`)

## Where to Add New Code

**New Feature:**

- Primary code: Add processor to `processors/[feature]-processor.mjs` OR add route to `daemon/server.mjs`
- Tests: Not applicable (no test infrastructure)
- Configuration: Add to `config/constants.mjs` or `config/[feature].json` if needed

**New Processor (e.g., for HTML files):**

- Implementation: `processors/html-processor.mjs` (follow markdown-processor.mjs pattern)
- Integration: Import in `daemon/server.mjs` hook handler, add route for `/convert?format=html`
- Database: Extend documents table if new columns needed

**New Scheduled Task:**

- Implementation: Add cron.schedule() call in `daemon/scheduler.mjs` (initScheduler function)
- Logic: Add business logic as standalone function or import from processor
- Logging: Use `console.log('[scheduler]', message)`

**New CLI Script:**

- Implementation: Create `scripts/[operation].mjs` with async main function
- Integration: Add npm script to `package.json` under "scripts" section
- Database: Access `data/documind.db` via Database() constructor with schema migrations if needed

**New Analysis:**

- Implementation: Create processor module (`processors/[analysis]-processor.mjs`) OR standalone script (`scripts/[operation].mjs`)
- Results: Insert into appropriate table (keywords, deviations, similarities, etc.)
- Scheduling: Add cron job in scheduler.mjs if periodic, or call via `/hook` endpoint if event-driven

**New API Endpoint:**

- Implementation: Add `app.get()` or `app.post()` in `daemon/server.mjs` (around line 41-371)
- Database: Query `db.prepare()` calls (follow existing patterns for parameterized queries)
- Validation: Check parameters, return 400 for errors, 404 for not found, 500 for server errors

**Utilities / Shared Helpers:**

- Shared helpers: Create `graph/[helper-name].mjs` or `processors/[shared]-utils.mjs`
- Path resolution: Import from `path` module (already used in relations.mjs)
- Database queries: Create prepared statements in processor or daemon

## Special Directories

**data/documind.db:**

- Purpose: SQLite database (FTS5, relationships, scan history, keywords, diagrams)
- Generated: Yes (created by `npm run db:init`)
- Committed: No (too large, regenerated on each machine)

**index/:**

- Purpose: Scan output registry
- Generated: Yes (created by scan-all-repos.mjs)
- Committed: No (output only, regenerated on each scan)

**data/logs/:**

- Purpose: PM2 daemon logs
- Generated: Yes (PM2 writes here)
- Committed: No (runtime logs)

**data/mermaid/:**

- Purpose: Generated Mermaid diagram files
- Generated: Yes (created by mermaid-processor.mjs)
- Committed: Partial (check .gitignore; source files might be committed, outputs not)

**docs/07-api/jsdoc/:**

- Purpose: Generated JSDoc API reference
- Generated: Yes (created by `npm run docs:jsdoc`)
- Committed: No (regenerated from comments)

**.planning/codebase/:**

- Purpose: GSD codebase analysis documentation
- Generated: Yes (created by `/gsd:map-codebase` command)
- Committed: Yes (helps future planning commands)

---

---
Structure analysis: 2026-03-15
