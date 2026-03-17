---
phase: 04-mcp-server-read-tools
plan: 01
subsystem: mcp
tags: [mcp, stdio, read-tools, sqlite, fts5]
dependency_graph:
  requires: []
  provides: [daemon/mcp-server.mjs, mcp-stdio-server, 6-read-tools]
  affects: [ecosystem.config.cjs, package.json]
tech_stack:
  added: ["@modelcontextprotocol/sdk@1.27.1", "zod@3.25.76"]
  patterns: [McpServer, StdioServerTransport, readonly-sqlite, stdout-stderr-redirect]
key_files:
  created: [daemon/mcp-server.mjs]
  modified: [ecosystem.config.cjs, package.json]
decisions:
  - "stdout redirect must be line 1 before all imports — any console.log in imported modules would corrupt the JSON-RPC wire without this"
  - "DB opened readonly: true — MCP server is read-only by design; WAL pragma skipped on readonly connection"
  - "check_existing confidence formula: 1 - abs(rank)/20 — FTS5 rank is negative float; divisor of 20 is tunable baseline"
  - "findRelated result sliced to 200 — safety cap to prevent large graph hops from producing unmanageable payloads"
metrics:
  duration: "5m 24s"
  completed: "2026-03-16"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 4 Plan 01: MCP stdio Server with 6 Read Tools Summary

**One-liner:** MCP stdio server (daemon/mcp-server.mjs) with 6 read tools backed by FTS5 + relationship graph, stdout redirected to stderr at line 1.

## What Was Built

A self-contained MCP stdio server (`daemon/mcp-server.mjs`, ~275 lines) that exposes all 6 DocuMind read tools via the Model Context Protocol. The server opens the SQLite DB in readonly mode, loads the context profile at startup, and connects via `StdioServerTransport`. All `console.log` output is redirected to stderr at line 1 to protect the JSON-RPC wire.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Install MCP SDK and bump zod | 950f482 | package.json |
| 2 | Create mcp-server.mjs with 6 tools + PM2 config | 621e96c | daemon/mcp-server.mjs, ecosystem.config.cjs |

## Tools Implemented

| Tool | Requirement | Description |
| ---- | ----------- | ----------- |
| search_docs | MCPR-02 | FTS5 full-text search with repo/category/classification filters |
| get_related | MCPR-03 | Recursive relationship graph traversal via findRelated(), capped at 200 results |
| get_keywords | MCPR-04 | TF-IDF keyword cloud with repo and category filters |
| get_tree | MCPR-05 | Folder hierarchy from folder_nodes table |
| check_existing | MCPR-06 | Existence check with FTS5 confidence scoring |
| get_diagrams | MCPR-07 | Diagram registry with stale filter and active_url computed field |

## Decisions Made

1. **stdout redirect at line 1 before imports** — Any `console.log` from imported modules (relations.mjs uses it) would write to stdout and corrupt the JSON-RPC stream. The redirect at line 1 intercepts all subsequent calls including those from imported code.

2. **Readonly DB, no WAL pragma** — MCP server is read-only by contract. Setting WAL pragma on a readonly connection is a no-op and was confirmed safe to skip per research findings.

3. **check_existing confidence formula: `1 - abs(rank)/20`** — FTS5 rank is a negative float (closer to 0 = more relevant). Dividing by 20 as a tunable baseline converts it to a 0-1 confidence score. This is explicitly noted as tunable.

4. **findRelated sliced to 200** — A 3-hop traversal on a dense graph can return thousands of rows. The 200-entry safety cap prevents tool responses from becoming unmanageable without breaking the graph query itself.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```text
node --check daemon/mcp-server.mjs  -> PASS (syntax valid)
grep -c "server.tool" daemon/mcp-server.mjs  -> 6
First console.log line: redirect to stderr  -> PASS
grep "out_file.*dev/null" ecosystem.config.cjs  -> PASS
npm ls @modelcontextprotocol/sdk  -> 1.27.1 installed
Server startup test: "[mcp-server] DocuMind MCP ready"  -> PASS
```

## Self-Check: PASSED

- [x] daemon/mcp-server.mjs exists (275 lines)
- [x] ecosystem.config.cjs has documind-mcp entry
- [x] package.json has @modelcontextprotocol/sdk, zod ^3.25.0, mcp:dev, mcp:inspect scripts
- [x] Commit 950f482 exists
- [x] Commit 621e96c exists
