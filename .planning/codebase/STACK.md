# Technology Stack

**Analysis Date:** 2026-03-15

## Languages

### Primary:

- JavaScript/Node.js - Server runtime (ES modules), daemon and CLI scripts

- SQL - SQLite database schema and queries

## Runtime

### Environment:

- Node.js >= 20.0.0 (required)

### Package Manager:

- npm (package-lock.json present)

- Lockfile: present (package-lock.json)

## Frameworks

### Core:

- Express.js 5.2.1 - REST API server running on port 9000 with JSON request/response handling

### Data Storage:

- SQLite (better-sqlite3 12.6.2) - Synchronous database with FTS5 full-text search support, foreign keys enabled, WAL mode for concurrent access

### Task Scheduling:

- node-cron 3.0.3 - Cron-based task scheduling for background jobs (hourly, daily, weekly)

### File System Watcher:

- chokidar 4.0.3 - File system monitoring for document change detection

### Process Management:

- PM2 (ecosystem.config.cjs) - Background daemon orchestration on port 9000

## Key Dependencies

### Critical:

- better-sqlite3 (12.6.2) - Core database with FTS5 indexing for 620+ markdown documents, enables synchronous queries for indexing pipeline

- express (5.2.1) - REST API server providing search, graph, tree endpoints, webhook receiver

- chokidar (4.0.3) - Real-time file watcher for document change detection, triggers incremental indexing

- node-cron (3.0.3) - Scheduled task orchestration for hourly scans, daily full scans, weekly analysis

### Document Processing:

- pdf-parse (2.4.5) - PDF text extraction for indexing and summary generation

- mammoth (1.11.0) - DOCX file conversion to HTML

- turndown (7.2.2) - HTML to Markdown conversion (paired with mammoth for DOCX → MD)

- gray-matter (4.0.3) - Markdown frontmatter (YAML) parsing for metadata extraction

- markdown-it (14.0.0) - Markdown parsing and AST generation

### Text Analysis & NLP:

- natural (8.1.1) - TF-IDF keyword extraction and tokenization for keyword cloud generation

- string-similarity (4.0.4) - Document similarity detection (Jaccard/cosine distance)

- fast-levenshtein (3.0.0) - Levenshtein distance calculations for content comparison

### File Handling:

- fast-glob (3.3.2) - Multi-repo file pattern matching for document discovery

- glob (11.0.0) - File globbing for script operations

- ignore (5.3.0) - .gitignore file respect during scanning

### Utilities:

- chalk (5.3.0) - Terminal color output for CLI messages

- ora (8.0.1) - Spinner/progress indicators for long-running operations

- table (6.8.1) - ASCII table rendering for report output

- date-fns (3.0.6) - Date manipulation and formatting

- diff (5.1.0) - Text diffing for change detection

- zod (3.22.4) - Runtime schema validation for API payloads and database records

## Development & Build

### Linting & Formatting:

- markdownlint-cli2 (0.15.0) - Markdown rule enforcement (config: `config/.markdownlint.json`)

- prettier (3.6.2) - Code formatter for JavaScript/JSON

### Testing & Documentation:

- jsdoc (4.0.5) - API documentation generation from JSDoc comments

- better-docs (2.7.3) - Custom JSDoc theme

- docdash (2.0.2) - JSDoc template

### Diagram Generation:

- @mermaid-js/mermaid-cli (11.12.0) - Mermaid diagram rendering to SVG/PNG

### Link Validation:

- markdown-link-check (3.14.1) - Hyperlink validation across markdown files (config: `config/.markdown-link-check.json`)

### Pre-commit Hooks:

- husky (9.1.7) - Git hook management

- lint-staged (16.2.6) - Run linting/formatting on staged files

### Browser Automation:

- puppeteer (24.30.0) - Headless browser control (potential FigJam automation use case)

### CLI Utilities:

- tree-cli (0.6.7) - Directory tree visualization

## Configuration Files

### Markdown & Linting:

- `config/.markdownlint.json` - Linting rules (MD001-MD050 enforcement, code block language requirement via MD040)

- `config/.markdown-link-check.json` - Link validation configuration

### Database:

- `scripts/db/schema.sql` - Core schema definition with FTS5, relationships, keywords, diagrams, folder nodes, conversion log

### Daemon:

- `ecosystem.config.cjs` - PM2 configuration with port 9000, NODE_ENV, database path, logging

### Repository Metadata:

- `config/constants.mjs` - Canonical list of 13+ active/legacy repositories with GitHub URLs and local paths

- `config/repo-schema.json` - Repository structure schema

- `config/custom-error-patterns.json` - Custom markdown error patterns for auto-fixing

## Platform Requirements

### Development:

- Node.js >= 20.0.0

- npm 8+

- SQLite3 (included via better-sqlite3)

- Git (for repository scanning)

### Production:

- Node.js >= 20.0.0

- PM2 (for daemon management)

- SQLite3 support

- Port 9000 available (Express daemon)

- Filesystem write access to `data/` (database, logs, diagrams)

## Environment Variables

### Configuration (ecosystem.config.cjs / daemon):

- `PORT` - Express server port (default: 9000)

- `NODE_ENV` - Environment mode (production/development)

- `DOCUMIND_DB` - SQLite database path (default: `./data/documind.db`)

**Secrets:** Not detected in repository (None in `.env` files committed)

## Ports & Services

| Service | Port | Purpose |

| ------- | ---- | ------- |

| Express API | 9000 | REST endpoints (search, graph, scan, diagrams, webhooks) |

## Database Engine Details

- **Type:** SQLite (WAL mode enabled)

- **Size:** ~620+ documents indexed

- **Indexes:** 40+ indexes on documents, relationships, keywords, diagrams, conversions

- **FTS:** Full-Text Search via FTS5 virtual tables (documents_fts, keywords_fts)

- **Triggers:** Auto-sync triggers for FTS index maintenance

- **Views:** 10+ views for common queries (documents_with_issues, similar_pairs, stale_diagrams, document_graph, folder_tree, pending_relinks)

- **Foreign Keys:** Enabled globally (pragma foreign_keys = ON)

---

---

Stack analysis: 2026-03-15
