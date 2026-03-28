# CLAUDE.md - DocuMind v2.0

## Documentation Intelligence & Management System

**Version:** 2.0.0
**Created:** 2025-11-06
**Last Updated:** 2026-03-10
**Package:** `@design-dvw/documind`

---

## Overview

DocuMind is the central documentation intelligence service for the DVWDesign ecosystem. It runs as a persistent background daemon (PM2-managed) on port 9000, providing:

- Full-text search across 620+ markdown files via SQLite FTS5

- Document relationship graph with recursive traversal

- File conversion (DOCX/RTF to Markdown, PDF indexing)

- Keyword extraction and classification (TF-IDF)

- Folder hierarchy analysis with Mermaid diagram generation

- Scheduled scanning, linting, and fixing across 14+ repositories

- Agent-callable REST API

**Absolute path:** `/Users/Shared/htdocs/github/DVWDesign/DocuMind/` (macOS default; set `DOCUMIND_REPOS_DIR` to override for other environments)

---

## Repository Structure

```text

DocuMind/
├── daemon/
│   ├── server.mjs            # Express API on port 9000
│   ├── scheduler.mjs         # node-cron job orchestrator
│   ├── watcher.mjs           # chokidar file watcher
│   └── hooks.mjs             # Claude hook handlers
├── processors/
│   ├── markdown-processor.mjs    # Parse, lint, index markdown
│   ├── pdf-processor.mjs         # PDF text extraction + summary
│   ├── word-processor.mjs        # DOCX/RTF to Markdown
│   ├── mermaid-processor.mjs     # Generate .mmd files + FigJam links
│   ├── tree-processor.mjs        # Folder hierarchy analysis
│   └── keyword-processor.mjs     # TF-IDF keyword extraction
├── graph/
│   ├── relations.mjs             # Document relationship builder
│   └── queries.mjs               # Graph traversal (recursive CTEs)
├── scripts/
│   ├── db/
│   │   ├── schema.sql            # Full DB schema (v2.0)
│   │   └── init-database.mjs     # DB initialization + migration
│   ├── scan-all-repos.mjs        # Multi-repo scanner
│   ├── index-markdown.mjs        # Index builder
│   ├── fix-markdown.mjs          # Auto-fixer
│   ├── validate-timestamps.mjs   # Metadata validator
│   ├── watch-and-index.mjs       # Legacy watcher (use daemon instead)
│   └── generate-tree-schema.mjs  # Tree schema generator
├── data/
│   ├── documind.db               # SQLite database (FTS5 + graph)
│   └── diagrams/                 # Generated .mmd diagram files (per-repo: docs/diagrams/)
├── config/
│   ├── .markdownlint.json        # Linting rules
│   └── .markdown-link-check.json # Link validation config
├── ecosystem.config.cjs          # PM2 daemon configuration
├── package.json
└── CLAUDE.md                     # This file

```

---

## Daemon Mode (Primary)

DocuMind runs as a PM2-managed background service:

```bash

# Start daemon

npm run daemon:start        # pm2 start ecosystem.config.cjs

# Stop daemon

npm run daemon:stop         # pm2 stop documind

# Dev mode (foreground)

npm run daemon:dev          # node daemon/server.mjs

# Check status

npm run daemon:status       # pm2 show documind

# View logs

npm run daemon:logs         # pm2 logs documind

```

## Environment Configuration

DocuMind loads configuration from environment variables, with optional `.env` file support via Node 22's `process.loadEnvFile()`. All config is centralized in `config/env.mjs`.

| Variable                  | Default                                          | Description                                                                                       |

| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |

| `PORT`                    | `9000`                                           | HTTP server port                                                                                  |

| `DOCUMIND_DB`             | `data/documind.db`                               | Path to SQLite database (relative to project root)                                                |

| `DOCUMIND_PROFILE`        | `config/profiles/dvwdesign.json`                 | Active repository profile JSON                                                                    |

| `DOCUMIND_REPOS_DIR`      | *(unset — uses macOS fallback in constants.mjs)* | Base directory containing all repositories to scan. When set, overrides the hardcoded macOS path. |

| `DOCUMIND_REPOS`          | *(unset — all repos)*                            | Comma-separated list of repo names to scan (overrides profile)                                    |

| `DOCUMIND_CRON_HEARTBEAT` | `*/15 * * * *`                                   | Cron for file watcher heartbeat check                                                             |

| `DOCUMIND_CRON_HOURLY`    | `0 * * * *`                                      | Cron for incremental scan                                                                         |

| `DOCUMIND_CRON_DAILY`     | `0 2 * * *`                                      | Cron for full scan + analysis                                                                     |

| `DOCUMIND_CRON_WEEKLY`    | `0 3 * * 0`                                      | Cron for PDF re-index + keyword refresh                                                           |

| `DOCUMIND_CRON_RELINK`    | `0 */6 * * *`                                    | Cron for relink processor check                                                                   |

| `DOCUMIND_MCP_MODE`         | `stdio`                                          | MCP transport mode: `stdio` (local Claude Code) or `http` (remote consumers over HTTP)            |

| `DOCUMIND_MCP_TOKEN`        | *(unset)*                                        | Bearer token(s) for MCP HTTP endpoint (comma-separated). Required when MCP mode is `http`.        |

| `DOCUMIND_MCP_CORS_ORIGINS` | *(unset)*                                        | Allowed CORS origins for MCP HTTP endpoint (comma-separated). Empty disables CORS.                |

Copy `.env.example` to `.env` for local development. In Docker, pass vars directly. The daemon starts without `.env` — macOS defaults are used as fallbacks.

## API Endpoints (port 9000)

| Endpoint      | Method | Description                         |

| ------------- | ------ | ----------------------------------- |

| `/health`     | GET    | Health check + version              |

| `/stats`      | GET    | Dashboard statistics                |

| `/search?q=`  | GET    | Full-text search via FTS5           |

| `/graph`      | GET    | Document relationship graph         |

| `/tree/:repo` | GET    | Folder hierarchy + diagrams         |

| `/keywords`   | GET    | Keyword cloud data                  |

| `/diagrams`   | GET    | Diagram registry                    |

| `/scan`       | POST   | Trigger scan (optional: `{ repo }`) |

| `/index`      | POST   | Reindex documents                   |

| `/convert`    | POST   | Convert file (DOCX/RTF/PDF)         |

| `/hook`       | POST   | Claude hook receiver                |

| `/mcp`        | POST/GET/DELETE | MCP Streamable HTTP endpoint (requires bearer token; active only in `http` mode) |

### Scheduled Tasks

| Schedule     | Task                                                    |

| ------------ | ------------------------------------------------------- |

| Every 15 min | File watcher heartbeat check                            |

| Every hour   | Incremental scan (changed files only, via content_hash) |

| Daily 2 AM   | Full scan + similarity detection + deviation analysis   |

| Weekly Sun   | PDF re-index + keyword refresh + graph rebuild          |

## Database Schema (SQLite + FTS5)

### Core Tables (v1.0)

- `documents` — All indexed documents with content, metadata, content_hash

- `documents_fts` — FTS5 virtual table for full-text search

- `scan_runs` — Scan execution history

- `similarities` — Document similarity pairs (Levenshtein + cosine)

- `deviations` — Convention deviation detection

- `canonical_docs` — Canonical document registry

### v2.0 Tables

- `doc_relationships` — Graph edges (8 relationship types: imports, parent_of, variant_of, supersedes, depends_on, related_to, generated_from, dispatched_to)

- `keywords` — TF-IDF extracted keywords with categories (technology, action, topic)

- `keywords_fts` — FTS5 for keyword search

- `folder_nodes` — Repository folder hierarchy with classification

- `diagrams` — Diagram registry (Mermaid paths + FigJam URLs + staleness tracking)

- `conversions` — File conversion audit log

### Key Views

- `document_graph` — Joined relationship view with source/target paths

- `repo_keyword_cloud` — Aggregated keyword scores per repository

- `folder_tree` — Hierarchical folder view with doc counts

- `stale_diagrams` — Diagrams needing regeneration

### Database Commands

```bash

npm run db:init             # Initialize/migrate schema
npm run db:reset            # Drop and recreate (destructive!)
npm run db:migrate          # Apply migrations only

```

## Processors

### Markdown Processor

Parses markdown files with gray-matter frontmatter, detects category from path/content, indexes into documents table with full content for FTS5.

### PDF Processor

Extracts text via pdf-parse, generates summaries (first 500 words + headings), stores in documents table, logs in conversions table.

### Word Processor

Converts DOCX to Markdown via mammoth + turndown. Adds frontmatter, enforces markdownlint compliance. RTF support via text extraction.

### Keyword Processor

TF-IDF keyword extraction via natural.js. Classifies keywords into technology, action, and topic categories. Batch inserts into keywords table.

### Tree Processor

Walks repository directories, classifies folders (docs, source, config, tests, scripts, assets), stores in folder_nodes table, generates color-coded Mermaid .mmd files.

### Mermaid Processor

Generates .mmd diagram files, registers in diagrams table with staleness detection via source_hash comparison. Inserts FigJam links into markdown files.

## Graph Queries

Document relationships support recursive CTE traversal:

```bash

# Find related docs (2 hops)

curl "http://localhost:9000/graph?docId=42&hops=2"

# Full graph export

curl "http://localhost:9000/graph"

```

Relationship types: `imports`, `parent_of`, `variant_of`, `supersedes`, `depends_on`, `related_to`, `generated_from`, `dispatched_to`

## CLI Commands (Legacy + New)

### Scanning & Indexing

```bash

npm run scan                # Scan all repositories
npm run scan:report         # Scan + generate report
npm run scan:enhanced       # Enhanced scanner with similarity detection
npm run index               # Create organized index
npm run index:update        # Update existing index

```

### Linting & Fixing

```bash

npm run lint                # Lint markdown files
npm run lint:fix            # Auto-fix linting issues
npm run fix                 # Fix systematic errors (current dir)
npm run fix:all             # Fix all repositories
npm run fix:custom          # Fix custom error patterns
npm run fix:custom:all      # Fix custom errors across all repos

```

### Analysis

```bash

npm run analyze:similarities    # Detect similar documents
npm run analyze:deviations      # Detect convention deviations
npm run analyze:all             # Run all analyses
npm run analyze:patterns        # Analyze error patterns

```

### Reports

```bash

npm run report:dashboard    # Deviation dashboard
npm run report:canonical    # Canonical document report

```

### Tree & Diagrams

```bash

npm run tree:visual         # Display tree in terminal
npm run tree:structure      # Export tree to file
npm run tree:schema         # Generate JSON tree schema
npm run tree:update         # Update structure + schema
npm run diagram:generate    # Generate diagram from .mmd source

```

### Validation

```bash

npm run validate            # Validate timestamps/versions
npm run validate:fix        # Auto-fix validation issues
npm run validate:custom     # Validate custom error patterns

```

### Documentation

```bash

npm run docs:jsdoc          # Generate JSDoc documentation
npm run docs:jsdoc:serve    # Serve JSDoc on local server

```

## Markdown Standards

Configuration: `config/.markdownlint.json`

### Enforced Rules

- MD001: Heading levels increment by one

- MD003: ATX-style headings (`#` not underline)

- MD022: Blank lines around headings

- MD031: Blank lines around fenced code blocks

- MD032: Blank lines around lists

- MD040: ALL code blocks MUST have language type

### Table Separator Format

```text

CORRECT:

| Column | Column |

| ------ | ------ |

WRONG:

| Column | Column |

| -------- | -------- |

```

Rule: one space between pipe and dashes on each side.
Alignment markers are allowed: `| :--- | :---: | ---: |`

Auto-fixed by `npm run fix:custom` (pattern `table-3`).

### Fenced Code Block Identifiers

**Every** fenced code block **MUST** have a language identifier. No empty ` ``` ` blocks.

When the content language is obvious, use the specific identifier (`javascript`, `bash`, `json`, `python`, `css`, `html`, `yaml`, `typescript`, etc.).

When no specific language applies, use this **default hierarchy**:

1. **`md`** — if the content is markdown (headings, lists, links, emphasis)

2. **`diagram`** — if the content is a diagram (Mermaid, FigJam, flowcharts)

3. **`text`** — last resort for plain text / non-code content

```text

✅ CORRECT:
` ` `javascript
const x = 1;
` ` `

` ` `md

## Section Title

- Item one

` ` `

` ` `diagram
graph TD
    A --> B
` ` `

` ` `text
Some plain text output
` ` `

❌ WRONG:
` ` `
const x = 1;
` ` `

```

Enforced by MD040 (markdownlint) + auto-detected by `fix-markdown.mjs`.

## Dependencies

### Runtime

- `better-sqlite3` — SQLite with FTS5 support

- `express` — REST API server (port 9000)

- `chokidar` — File system watcher

- `node-cron` — Scheduled task runner

- `mammoth` — DOCX to HTML conversion

- `turndown` — HTML to Markdown conversion

- `pdf-parse` — PDF text extraction

- `natural` — NLP toolkit (TF-IDF keyword extraction)

- `gray-matter` — Markdown frontmatter parser

- `fast-glob` — File pattern matching

- `chalk` — Terminal output styling

- `zod` — Schema validation

### Dev

- `@mermaid-js/mermaid-cli` — Mermaid diagram rendering

- `markdownlint-cli2` — Markdown linting

- `prettier` — Code formatting

- `husky` + `lint-staged` — Pre-commit hooks

- `jsdoc` — API documentation generation

## Integration Points

### RootDispatcher

- Port 9000 registered in `RootDispatcher/config/port-registry.json`

- Dispatches indexed as `dispatched_to` relationships in graph

- Changelog entries tracked via document indexing

### Figma MCP

- FigJam diagram generation via `generate_diagram` tool

- Diagram URLs stored in `diagrams` table

- FigJam links inserted into markdown files

### Claude Code Hooks

- `post-write` on `.md` files triggers re-lint + re-index

- `post-commit` triggers scan of changed files

- Hook endpoint: `POST http://localhost:9000/hook`

### MCP HTTP Transport

- When `DOCUMIND_MCP_MODE=http`, MCP tools are available at `POST /mcp` on port 9000

- Requires `Authorization: Bearer <token>` header (token from `DOCUMIND_MCP_TOKEN`)

- Supports `GET /mcp` (SSE) and `DELETE /mcp` (session termination) per MCP spec

- Default mode is `stdio` — no changes needed for local Claude Code usage

### All DVWDesign Repositories

- Scans 14+ repositories for markdown files

- Monitors file changes via chokidar watcher

- Provides full-text search across entire ecosystem

## RootDispatcher Integration

**Version:** 1.0 | **Last updated:** 2026-03-10

This repo is part of the DVWDesign ecosystem coordinated by RootDispatcher.

### Session Start Protocol

1. Read memory file: `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/repos/DocuMind.md`

2. Check pending dispatches: `RootDispatcher/dispatches/pending/ALL/` and `RootDispatcher/dispatches/pending/DocuMind/`

3. Read shared conventions if needed: `RootDispatcher/memory/global-rules.md`

4. Apply pending dispatches and move to `dispatches/applied/`

### Session End Protocol

1. Update memory file with current state

2. Move applied dispatches to `dispatches/applied/`

3. Append to `RootDispatcher/memory/changelog.jsonl`

4. Log significant decisions to `RootDispatcher/memory/decisions.jsonl`

**Status:** Active (PM2 daemon on port 9000)
**Engine:** Node.js >= 20.0.0
