# DocuMind Usage Guide

How to interact with DocuMind as a human user.

---

## 1. Claude Code (MCP Tools)

DocuMind registers 14 MCP tools. Claude uses them automatically when you ask about documentation, but you can also request them directly.

### Natural Language Prompts

Just ask Claude in any repo where DocuMind MCP is connected:

```text
Search my docs for "authentication"
Are there any duplicate docs about Docker?
What's related to CLAUDE.md?
Show me the folder tree for DocuMind
Which diagrams are stale?
What keywords does the LAM repo focus on?
Lint this file: docs/SETUP.md
Fix the markdown issues in docs/ONBOARDING.md
Index this file I just created: docs/NEW-FEATURE.md
Scan the DocuMind repo for changes
```

### Explicit Tool Requests

If you want to be precise about which tool Claude uses:

```text
Use search_docs to find "MCP transport" in the DocuMind repo
Use check_existing to see if we already have Docker setup docs
Use get_deviations to find convention violations
Use trigger_scan to do a full scan of all repos
```

### MCP Tool Reference

| Tool               | What it does                             | Example prompt                              |
| ------------------ | ---------------------------------------- | ------------------------------------------- |
| `search_docs`      | Full-text search across all indexed docs | "Search for error handling patterns"        |
| `get_related`      | Find docs connected to a given document  | "What's related to the onboarding guide?"   |
| `get_keywords`     | TF-IDF keyword cloud by repo/category    | "What topics does LAM cover?"               |
| `get_tree`         | Folder hierarchy with doc counts         | "Show me the DocuMind folder structure"     |
| `check_existing`   | Duplicate detection before creating docs | "Do we already have a Docker guide?"        |
| `get_diagrams`     | Query diagram registry                   | "Which diagrams need updating?"             |
| `get_similarities` | Find similar/duplicate doc pairs         | "Are there any duplicate docs?"             |
| `get_deviations`   | Convention violation detection           | "What naming deviations exist?"             |
| `index_file`       | Re-index a single file                   | "Index docs/NEW-FILE.md"                    |
| `lint_file`        | Check markdown quality (read-only)       | "Lint this file"                            |
| `fix_file`         | Auto-fix markdown issues                 | "Fix the markdown in this file"             |
| `trigger_scan`     | Scan repos for changes                   | "Scan all repos" or "Scan DocuMind"         |
| `register_diagram` | Register a new .mmd diagram              | "Register this diagram"                     |
| `curate_diagram`   | Set curated FigJam URL for a diagram     | "Relink this diagram to the new FigJam URL" |

---

## 2. Slash Commands (Claude Code)

Type these in any Claude Code session where DocuMind is the active project:

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `/scan-docs`            | Scan all DVWDesign repos, generate stats report           |
| `/diagram-registry`     | View diagram status, pending relinks, stale diagrams      |
| `/figma-diagram`        | Create a FigJam diagram (.mmd + .png + FigJam + registry) |
| `/figma-curate`         | Relink a diagram after FigJam curation                    |
| `/figma-analyze`        | Analyze Figma component structure                         |
| `/figma-extract-tokens` | Extract design tokens from Figma                          |
| `/figma-generate-code`  | Generate code from Figma designs                          |

---

## 3. Web Dashboard

Open in a browser while the daemon is running:

```text
http://localhost:9000/dashboard/diagrams.html
```

Interactive diagram curation UI with filtering, search, and status badges.

---

## 4. REST API (curl / browser)

The daemon runs on port 9000. All endpoints return JSON.

### Quick Examples

```bash
# Health check
curl http://localhost:9000/health

# Search
curl "http://localhost:9000/search?q=docker&limit=5"

# Stats dashboard
curl http://localhost:9000/stats

# Folder tree for a repo
curl http://localhost:9000/tree/DocuMind

# Document graph
curl "http://localhost:9000/graph?repo=DocuMind&depth=2"

# Keywords
curl "http://localhost:9000/keywords?repo=DocuMind&category=technology"

# Trigger incremental scan
curl -X POST http://localhost:9000/scan

# Trigger full scan of one repo
curl -X POST http://localhost:9000/scan -H "Content-Type: application/json" -d '{"repo":"DocuMind","mode":"full"}'

# List stale diagrams
curl "http://localhost:9000/diagrams?stale=true"

# Diagram lookup by name
curl http://localhost:9000/diagrams/lookup/documind-architecture
```

### Full Endpoint Reference

| Endpoint                    | Method          | Description                               |
| --------------------------- | --------------- | ----------------------------------------- |
| `/health`                   | GET             | Status, version, uptime, mcp_mode         |
| `/stats`                    | GET             | Dashboard statistics                      |
| `/search?q=`                | GET             | Full-text search (FTS5)                   |
| `/graph`                    | GET             | Document relationship graph               |
| `/tree/:repo`               | GET             | Folder hierarchy + diagrams               |
| `/keywords`                 | GET             | Keyword cloud data                        |
| `/diagrams`                 | GET             | Diagram registry                          |
| `/diagrams/lookup/:name`    | GET             | Single diagram lookup                     |
| `/diagrams/pending-relinks` | GET             | Diagrams awaiting curation                |
| `/diagrams/active-urls`     | GET             | Name-to-URL map                           |
| `/scan`                     | POST            | Trigger scan                              |
| `/index`                    | POST            | Reindex documents                         |
| `/convert`                  | POST            | Convert file (DOCX/RTF/PDF)               |
| `/hook`                     | POST            | Claude hook receiver                      |
| `/mcp`                      | POST/GET/DELETE | MCP HTTP endpoint (requires bearer token) |

---

## 5. CLI (npm scripts)

Run from the DocuMind project directory.

### Most Useful

```bash
# Start/stop daemon
npm run daemon:start
npm run daemon:stop
npm run daemon:logs

# Scan and index
npm run scan
npm run index

# Lint and fix markdown
npm run lint
npm run lint:fix
npm run fix:all

# Analysis
npm run analyze:similarities
npm run analyze:deviations

# Database
npm run db:init
npm run db:reset
```

### Full Script List

Run `npm run` with no arguments to see all available scripts.

---

## 6. Access by Context

| I want to... | Best method |
| --- | --- |
| Search docs while coding | Ask Claude (MCP: `search_docs`) |
| Check if a doc already exists | Ask Claude (MCP: `check_existing`) |
| Fix markdown formatting | Ask Claude (MCP: `fix_file`) or `npm run fix:all` |
| See what's stale or broken | `/diagram-registry` or `curl /stats` |
| Browse diagrams visually | Web dashboard at `:9000/dashboard/diagrams.html` |
| Trigger a scan from another tool | REST API: `POST /scan` |
| Debug the daemon | `npm run daemon:logs` |
| Bulk operations across repos | CLI: `npm run scan`, `npm run fix:all` |
| Expose MCP to remote consumers | Set `DOCUMIND_MCP_MODE=http` + bearer token |

---

## Prerequisites

- DocuMind daemon running (`npm run daemon:start` or `docker compose up`)
- For MCP tools: Claude Code with DocuMind MCP server configured
- For REST API: daemon accessible on port 9000
- For CLI: Node.js 20+ and `npm install` completed
