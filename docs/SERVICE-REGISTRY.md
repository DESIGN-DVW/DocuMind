# Service Registry — DVWDesign Ecosystem

**Version:** 1.0.0
**Created:** 2026-03-22
**Status:** Active

---

## DocuMind Services

### DocuMind v2.0 API

| Property    | Value                              |

| ----------- | ---------------------------------- |

| Type        | Express.js REST API                |

| Port        | 9000                               |

| Status      | Active (PM2-managed)               |

| Entry point | `daemon/server.mjs`                |

| Start       | `npm run daemon:start` (PM2)       |

| Dev         | `npm run daemon:dev` (foreground)  |

| PM2 config  | `ecosystem.config.cjs`             |

| Database    | `data/documind.db` (SQLite + FTS5) |

#### API Endpoints

| Endpoint                    | Method | Purpose                                      |

| --------------------------- | ------ | -------------------------------------------- |

| `/health`                   | GET    | Health check + version                       |

| `/stats`                    | GET    | Dashboard statistics                         |

| `/search?q=`                | GET    | Full-text search via FTS5                    |

| `/graph`                    | GET    | Document relationship graph                  |

| `/tree/:repo`               | GET    | Folder hierarchy + diagrams                  |

| `/keywords`                 | GET    | Keyword cloud data                           |

| `/diagrams`                 | GET    | Diagram registry                             |

| `/diagrams/active-urls`     | GET    | Flat map of all diagram URLs                 |

| `/diagrams/png/:repo/:file` | GET    | PNG file serving (path-traversal guarded)    |

| `/diagrams/lookup/:name`    | GET    | Single diagram lookup with markdown snippet  |

| `/diagrams/pending-relinks` | GET    | Diagrams awaiting curation                   |

| `/scan`                     | POST   | Trigger scan (optional: `{ repo, mode }`)    |

| `/index`                    | POST   | Reindex documents                            |

| `/convert`                  | POST   | Convert file (DOCX/RTF/PDF)                  |

| `/hook`                     | POST   | Claude hook receiver                         |

| `/diagrams/relink`          | POST   | Set curated URL and propagate                |

| `/diagrams/sync-registry`   | POST   | Regenerate DIAGRAM-REGISTRY.md from database |

| `/diagrams/bulk-relink`     | POST   | Multiple diagrams in one call                |

| `/diagrams/reverse-sync`    | POST   | Parse DIAGRAM-REGISTRY.md → upsert into DB   |

### DocuMind MCP Server

| Property    | Value                                  |

| ----------- | -------------------------------------- |

| Type        | MCP Stdio server                       |

| Transport   | stdio (JSON-RPC over stdout/stdin)     |

| Status      | Active (PM2 as `documind-mcp`)         |

| Entry point | `daemon/mcp-server.mjs`                |

| Start       | `npm run mcp:dev`                      |

| Inspect     | `npm run mcp:inspect`                  |

| Logs        | `/dev/null` (stdout reserved for wire) |

Registered in `.claude/mcp.json`:

```jsonc

{
  "documind": {
    "command": "node",
    "args": ["daemon/mcp-server.mjs"],
    "env": { "DOCUMIND_DB": "...", "DOCUMIND_PROFILE": "..." }
  }
}

```

#### MCP Tools

| Tool          | Purpose                                    |

| ------------- | ------------------------------------------ |

| `search_docs` | Full-text search across indexed docs       |

| `get_related` | Document relationship graph traversal      |

| `get_tree`    | Repository folder hierarchy                |

| `get_keywords`| Keyword cloud for a repository             |

| `get_stats`   | Dashboard statistics                       |

| `get_diagrams`| Diagram registry lookup                    |

### Background Services (embedded in daemon)

| Service      | Location                | Trigger                                               |

| ------------ | ----------------------- | ----------------------------------------------------- |

| Scheduler    | `daemon/scheduler.mjs`  | Cron: 15m heartbeat, 1h scan, 2AM full, Sun rebuild   |

| File Watcher | `daemon/watcher.mjs`    | chokidar: re-index on `.md` file changes              |

| Hook Handler | `daemon/hooks.mjs`      | `POST /hook`: Claude post-write/post-commit           |

### Diagram Dashboard

| Property | Value                                          |

| -------- | ---------------------------------------------- |

| Type     | Static HTML (served by Express)                |

| URL      | `http://localhost:9000/dashboard/diagrams.html`|

| Location | `dashboard/diagrams.html`                      |

| Purpose  | Web UI for diagram URL curation and relinking  |

### JSDoc Server

| Property | Value                            |

| -------- | -------------------------------- |

| Type     | Static file server (npx serve)   |

| Port     | Dynamic (typically 3000-5000)    |

| Start    | `npm run docs:jsdoc:serve`       |

| Content  | `docs/07-api/jsdoc/`             |

| Purpose  | Generated API documentation      |

---

## DVWDesign Port Registry

Source: `RootDispatcher/config/port-registry.json`

### Databases

| Port  | Service    | Runtime                  | Status |

| ----- | ---------- | ------------------------ | ------ |

| 6379  | Redis      | Docker (`lam-redis`)     | active |

| 27017 | MongoDB    | Native (`mongod`)        | active |

### Docker Containers

All managed via Docker Desktop. Restart with `docker compose up -d` in respective project directories.

#### Supabase Stack (RandD)

| Host Port | Service            | Container                  | Status                                       |

| --------- | ------------------ | -------------------------- | -------------------------------------------- |

| 54321     | Supabase API (Kong)| `supabase_kong_RandD`      | active                                       |

| 54323     | Supabase Studio    | `supabase_studio_RandD`    | active                                       |

| 54324     | Inbucket (email)   | `supabase_inbucket_RandD`  | active                                       |

| 54327     | Analytics          | `supabase_analytics_RandD` | active                                       |

| —         | PostgreSQL         | `supabase_db_RandD`        | active (internal :5432, not exposed on host) |

| —         | Auth               | `supabase_auth_RandD`      | active (internal :9999)                      |

| —         | Realtime           | `supabase_realtime_RandD`  | active (internal :4000)                      |

| —         | Storage            | `supabase_storage_RandD`   | active (internal :5000)                      |

| —         | REST (PostgREST)   | `supabase_rest_RandD`      | active (internal :3000)                      |

| —         | pg_meta            | `supabase_pg_meta_RandD`   | active (internal :8080)                      |

| —         | Vector             | `supabase_vector_RandD`    | active                                       |

#### Standalone Containers

| Host Port | Service    | Container    | Status |

| --------- | ---------- | ------------ | ------ |

| 3001      | Uptime Kuma| `uptime-kuma`| active |

| 5678      | n8n        | `n8n-local`  | active |

| 6379      | Redis      | `lam-redis`  | active |

### Dev Servers (Node.js)

| Port | Service                    | Repository          | Status    |

| ---- | -------------------------- | ------------------- | --------- |

| 3002 | LibraryAssetManager Client | LibraryAssetManager | active    |

| 3003 | any2figma Dashboard        | any2figma           | active    |

| 5173 | FigmailAPP Dev             | FigmailAPP          | active    |

| 5174 | CampaignManager Dev        | CampaignManager     | on-demand |

### APIs

| Port | Service                  | Repository          | Status    |

| ---- | ------------------------ | ------------------- | --------- |

| 4000 | LibraryAssetManager API  | LibraryAssetManager | active    |

| 4001 | any2figma API            | any2figma           | active    |

| 8000 | Python ML Server         | GlossiaApp          | on-demand |

| 8080 | MJML Dev Server          | mjml-dev-mode       | on-demand |

| 9000 | DocuMind v2.0 API        | DocuMind            | active    |

### Storybook Instances

| Port | Repository          | Status   |

| ---- | ------------------- | -------- |

| 6006 | FigmailAPP          | active   |

| 6007 | FigmaDSController   | active   |

| 6008 | CampaignManager     | active   |

| 6009 | Figma-Plug-ins      | available|

| 6010 | LibraryAssetManager | active   |

| 6011 | RandD               | reserved |

| 6012 | GlossiaApp          | reserved |

| 6013 | @figma-core         | reserved |

| 6014 | shared-packages     | reserved |

---

## MCP Servers

### Project-Level (DocuMind)

| Name            | Transport | Source                      | Status |

| --------------- | --------- | --------------------------- | ------ |

| documind        | stdio     | `daemon/mcp-server.mjs`.    | active |

| figma-desktop   | HTTP      | `http://127.0.0.1:3845/mcp` | active |

### Ecosystem-Level (RootDispatcher)

| Name           | Transport | Command / URL                                 | Status    |

| -------------- | --------- | --------------------------------------------- | --------- |

| figma-desktop  | HTTP      | `http://127.0.0.1:3845/mcp`                   | active    |

| shadcn         | stdio     | `npx -y shadcn@latest mcp`                    | available |

| mongodb        | stdio     | `npx -y @mongodb-js/mongodb-mcp-server`       | available |

| mui-mcp        | stdio     | `npx -y @mui/mcp@latest`                      | available |

| github-mcp     | stdio     | `npx -y @modelcontextprotocol/server-github`  | available |

| aikido         | stdio     | `npx -y @aikidosec/mcp`                       | available |

### Claude.ai Built-in MCPs

| Name     | Purpose                        |

| -------- | ------------------------------ |

| Figma    | Design context + code gen      |

| Linear   | Issue/project management       |

| Slack    | Channel/thread messaging       |

| Supabase | Database management + edge fns |

---

## Production URLs

| Service             | URL                              |

| ------------------- | -------------------------------- |

| CampaignManager     | `https://campaignmanager.dvw.design` |

| FigmailAPP          | `https://figmail.dvw.design`     |

| FigmaDSController   | `https://figmads.dvw.design`     |

| LibraryAssetManager | `https://lam.dvw.design`        |

| GlossiaApp          | `https://glossia.dvw.design`     |

| any2figma           | `https://any2figma.dvw.design`   |

---

## NPM Scripts Reference

### DocuMind Daemon

```bash

npm run daemon:start      # pm2 start ecosystem.config.cjs
npm run daemon:stop       # pm2 stop documind
npm run daemon:restart    # pm2 restart documind
npm run daemon:logs       # pm2 logs documind
npm run daemon:status     # pm2 show documind
npm run daemon:dev        # node daemon/server.mjs (foreground)

```

### MCP

```bash

npm run mcp:dev           # node daemon/mcp-server.mjs
npm run mcp:inspect       # MCP Inspector UI

```

### Documentation

```bash

npm run docs:jsdoc        # Generate JSDoc
npm run docs:jsdoc:serve  # Serve JSDoc locally

```

---

## Architecture Diagram

```diagram

graph TD
    subgraph DocuMind[:9000]
        API[Express API]
        SCH[Scheduler]
        WAT[Watcher]
        HOK[Hooks]
        DB[(SQLite + FTS5)]
        DASH[Dashboard UI]
    end

    subgraph MCP[DocuMind MCP - stdio]
        MCPS[MCP Server]
    end

    API --> DB
    SCH --> API
    WAT --> API
    HOK --> API
    DASH --> API
    MCPS --> DB

    CLAUDE[Claude Code] --> MCPS
    CLAUDE --> API
    VSCODE[VSCode] --> API
    CRON[PM2/Cron] --> SCH

```
