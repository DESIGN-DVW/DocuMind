# Stack Research

**Domain:** Kuzu Graph DB + LangChain text-to-Cypher integration for DocuMind (Node.js)
**Researched:** 2026-04-07
**Confidence:** MEDIUM — Kuzu npm package version and N-API approach verified via search; LangChain JS/Kuzu gap confirmed via multiple independent sources; Kuzu archival confirmed (The Register + GitHub issue + community posts); fork npm availability confirmed absent

---

## Critical Pre-Read: Kuzu Was Archived October 2025

**KuzuDB (`kuzudb/kuzu`) was archived on October 10, 2025.** The GitHub repo is now read-only. Kùzu Inc quietly abandoned the project. The npm package (`kuzu@0.11.3`) remains installable and functional — existing releases are not broken — but no new versions will ship from the original maintainer.

Three community forks have emerged:

- **LadybugDB** — community-driven fork by ex-Facebook/Google engineer Arun Sharma, targeting regulated industries. Website exists (`ladybugdb.com`). No npm package published yet.
- **Bighorn** — Kineviz fork, integrated into GraphXR, pledged open source. No npm package published yet.
- **Vela-Engineering/kuzu** — fork with concurrent multi-writer support. No npm package published yet.

**Decision:** Use `kuzu@0.11.3`. It is the final official release (~June 2025), ships with bundled `algo`, `fts`, `json`, and `vector` extensions, and is a frozen-but-functional dependency. The embedded property graph model, Cypher support, and Node.js N-API binary are complete and stable. Revisit in 6 months to see if a fork reaches npm.

---

## Critical Pre-Read: LangChain KuzuGraph Does Not Exist in JavaScript

**`KuzuGraph` and `KuzuQAChain` do not exist in `@langchain/community` (npm).** They exist only in the Python `langchain-community` and `langchain-kuzu` PyPI packages. Every LangChain-Kuzu integration article, notebook, and tutorial is Python. Searching for a JS equivalent returns only Python documentation.

LangChain.js (`@langchain/community`) does have `GraphCypherQAChain`, but it is wired exclusively to `Neo4jGraph`. There is no `KuzuGraph` class in the JS package as of April 2026.

**Decision:** The text-to-Cypher bridge must be implemented as a custom Node.js class using:

1. The `kuzu` npm package for Cypher execution
2. `@langchain/openai` or `@langchain/anthropic` for the LLM call that generates Cypher
3. A custom `KuzuGraphChain` class modeled on the Python `KuzuQAChain` pattern

This is approximately 150-200 lines of TypeScript — not a blocker, but it means the milestone scope includes building this adapter, not wiring a published package.

---

## Recommended Stack: New Packages Only

These are net-new additions to `package.json`. Do not remove or version-bump existing dependencies (`better-sqlite3`, `express`, `@modelcontextprotocol/sdk`, `zod`, etc.).

### Core Technologies (New)

| Technology          | Version  | Purpose                                                               | Why Recommended                                                                                                                                                                                                                                                                                                                   |
| :------------------ | :------- | :-------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kuzu`              | `0.11.3` | Embedded property graph DB with Cypher query language                 | Only embedded graph DB with a first-class Node.js N-API binary that ships prebuilt for Node 20/22; no server process required; runs in-process alongside SQLite; Cypher is the industry-standard property graph query language; v0.11.3 bundles algo/fts/json/vector extensions; supports both ESM (`import`) and CJS (`require`) |
| `@langchain/core`   | `^0.3.x` | LangChain base primitives (prompts, chains, messages, output parsers) | Required peer for all LangChain packages; provides `ChatPromptTemplate`, `StringOutputParser`, chain composition; keeps the LLM abstraction layer stable if you swap OpenAI for Anthropic later                                                                                                                                   |
| `@langchain/openai` | `^0.5.x` | OpenAI LLM adapter for text-to-Cypher generation                      | Provides `ChatOpenAI` with structured tool calling; use `model: "gpt-4o-mini"` for Cypher generation (fast, cheap, accurate enough for Cypher); swappable with `@langchain/anthropic` via shared `@langchain/core` interface                                                                                                      |

### Supporting Libraries (New, Optional)

| Library                | Version  | Purpose                  | When to Use                                                                                                                                        |
| :--------------------- | :------- | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@langchain/anthropic` | `^0.3.x` | Anthropic Claude adapter | Use instead of `@langchain/openai` if a Claude API key is preferred for Cypher generation; the custom `KuzuGraphChain` accepts any `BaseChatModel` |

### Existing Dependencies — No Changes

| Existing                    | Current Version | Note                                                        |
| :-------------------------- | :-------------- | :---------------------------------------------------------- |
| `better-sqlite3`            | `^12.6.2`       | Stays; FTS5 search remains in SQLite                        |
| `@modelcontextprotocol/sdk` | `^1.27.1`       | Stays; new graph MCP tools use existing server scaffold     |
| `express`                   | `^5.2.1`        | Stays; `/graph` endpoint is updated, not replaced           |
| `zod`                       | `^3.25.0`       | Stays; use for MCP tool input validation on new graph tools |

---

## Installation

```bash
# Core graph DB — pin exact version (project is archived, no future minor updates)
npm install kuzu@0.11.3

# LangChain primitives + LLM adapter
npm install @langchain/core @langchain/openai

# Optional: Claude as Cypher-generation LLM instead of OpenAI
npm install @langchain/anthropic
```

---

## Architecture Pattern: Custom KuzuGraphChain

Because no JS LangChain-Kuzu wrapper exists, build this structure under `graph/`:

```text
graph/
  kuzu-db.mjs          # DB singleton: open/close Kuzu, execute raw Cypher, return results
  kuzu-schema.mjs      # Schema introspection: queries CALL table_info() to return node/edge types
  kuzu-chain.mjs       # KuzuGraphChain: NL query -> schema-augmented prompt -> LLM -> Cypher -> execute -> LLM -> answer
  kuzu-migrate.mjs     # One-time migration: read doc_relationships from SQLite, write to Kuzu
```

The chain flow mirrors Python's `KuzuQAChain`:

1. `kuzu-schema.mjs` introspects the Kuzu schema (node tables, relationship tables, property types)
2. `kuzu-chain.mjs` builds a prompt: `[schema context] + [natural language question] -> generate valid Cypher for Kùzu`
3. `ChatOpenAI` (or `ChatAnthropic`) returns a Cypher statement
4. Execute Cypher via `kuzu-db.mjs` using `kuzu.Connection.execute()`
5. Second LLM call synthesizes a natural language answer from the query results

Kuzu stores its data in a **directory** (not a single file like SQLite). Add `data/kuzu/` as the Kuzu data directory alongside `data/documind.db`. Add `DOCUMIND_KUZU_DIR` to the environment config table.

---

## What NOT to Use

| Avoid                                 | Why                                                                                                                                                                                                                                        | Use Instead                                        |
| :------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------- |
| `langchain-kuzu` (PyPI)               | Python-only; no npm equivalent exists as of April 2026                                                                                                                                                                                     | Custom `KuzuGraphChain` in Node.js (150-200 lines) |
| `@kuzu/kuzu-wasm`                     | Browser/WASM build; lacks full persistent storage and N-API surface needed for a daemon                                                                                                                                                    | `kuzu` (native N-API binary)                       |
| `neo4j-driver`                        | Requires an external server process; wrong architecture for an embedded in-process graph DB                                                                                                                                                | `kuzu`                                             |
| `falkordb` + `@falkordb/langchain-ts` | Redis-based server; requires Docker sidecar; not embedded. `@falkordb/langchain-ts` does provide a first-class JS LangChain integration, but the server-process dependency is incompatible with DocuMind's single-process PM2 architecture | `kuzu` if embedded is the requirement              |
| `@langchain/langgraph`                | Stateful agent/workflow orchestration; not needed for a simple text-to-Cypher QA chain                                                                                                                                                     | `@langchain/core` + direct chain composition       |
| `langchain` (full package)            | Installs the entire LangChain monolith; `GraphCypherQAChain` from it targets Neo4j only; unnecessary weight                                                                                                                                | `@langchain/core` + `@langchain/openai`            |

---

## Version Compatibility

| Package                | Compatible With             | Notes                                                                                                                                                                                                                                                                                          |
| :--------------------- | :-------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kuzu@0.11.3`          | Node.js >= 14.15.0          | Uses Node-API (N-API) v5; ABI-stable across Node versions. Node 20 and 22 confirmed compatible. Prebuilt binaries ship inside the npm package (prebuildify approach) — no download step, no compile step on standard platforms. Falls back to source build if no prebuilt binary for platform. |
| `kuzu@0.11.3`          | `better-sqlite3@^12.6.2`    | No conflict; both are N-API modules but operate on independent files (`data/documind.db` vs `data/kuzu/`). Can be loaded in the same Node.js process without issues.                                                                                                                           |
| `kuzu@0.11.3`          | ES modules (`.mjs`)         | Both `import` (ESM) and `require` (CJS) are fully supported per Kuzu Node.js docs.                                                                                                                                                                                                             |
| `@langchain/core@^0.3` | `@langchain/openai@^0.5`    | Must use compatible major versions; LangChain 0.3.x requires Node >= 18                                                                                                                                                                                                                        |
| `@langchain/core@^0.3` | `@langchain/anthropic@^0.3` | Same major version requirement                                                                                                                                                                                                                                                                 |
| `@langchain/core@^0.3` | Node.js >= 18               | LangChain 0.3.x minimum requirement; DocuMind runs Node 20+ so no issue                                                                                                                                                                                                                        |

---

## Alternatives Considered

| Recommended             | Alternative                   | Why Not                                                                                                                                                                                                          |
| :---------------------- | :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kuzu@0.11.3`           | LadybugDB / Bighorn forks     | Neither has a published npm package as of April 2026. Cannot install via npm. Monitor for future releases.                                                                                                       |
| `kuzu@0.11.3`           | `neo4j-driver`                | Requires external Neo4j server process; breaks the in-process embedded architecture. Over-engineered for DocuMind's scale.                                                                                       |
| `kuzu@0.11.3`           | `falkordb`                    | Redis-based server; `@falkordb/langchain-ts` gives first-class JS LangChain integration, making it the only viable alternative IF the embedded architecture were relaxed. It is not currently relaxed.           |
| Custom `KuzuGraphChain` | Python LangChain-Kuzu sidecar | A Python FastAPI microservice wrapping `langchain-kuzu` would work but introduces a second runtime, two deployment processes, and a network call for every NL query. Not appropriate for a single-tenant daemon. |
| `@langchain/openai`     | Raw `openai` SDK              | LangChain's `BaseChatModel` abstraction allows swapping LLMs (OpenAI → Claude → Mistral) without rewriting the chain. Worth the thin overhead when the custom chain is already being built.                      |

---

## Sources

- [kuzu - npm](https://www.npmjs.com/package/kuzu) — latest version 0.11.3 confirmed; Node-API prebuildify approach; ESM/CJS support (MEDIUM confidence — npm page returned 403; confirmed via search result summaries)
- [Kuzu Node.js API docs](https://docs.kuzudb.com/client-apis/nodejs/) — N-API v5, Node >= 14.15.0, sync + async API (MEDIUM confidence — confirmed via search summaries)
- [KuzuDB abandoned — The Register, Oct 2025](https://www.theregister.com/2025/10/14/kuzudb_abandoned/) — archive confirmed October 10, 2025 (HIGH confidence — established trade publication)
- [Kuzu Forks — Graph Weekly Edge, Oct 2025](https://gdotv.com/blog/weekly-edge-kuzu-forks-duckdb-graph-cypher-24-october-2025/) — Ladybug and Bighorn fork status; no npm packages (MEDIUM confidence)
- [Kuzu is archived — getzep/graphiti Issue #1132](https://github.com/getzep/graphiti/issues/1132) — community confirmation of archival impact (HIGH confidence — GitHub issue thread)
- [langchain-kuzu PyPI](https://pypi.org/project/langchain-kuzu/) — Python-only; `pip install langchain-kuzu` confirms not in npm (HIGH confidence)
- [LangChain docs — Kuzu integration](https://docs.langchain.com/oss/python/integrations/graphs/kuzu_db) — Python-only; no JS equivalent page exists (HIGH confidence)
- [GraphCypherQAChain LangChain.js](https://v03.api.js.langchain.com/classes/langchain.chains_graph_qa_cypher.GraphCypherQAChain.html) — JS chain exists; targets Neo4j; no Kuzu graph parameter (HIGH confidence — official LangChain.js API reference)
- [@langchain/community npm](https://www.npmjs.com/package/@langchain/community) — latest 1.1.27; Python `KuzuGraph` has no JS counterpart in this package (MEDIUM confidence — search result)
- [FalkorDB LangChain JS/TS integration](https://www.falkordb.com/blog/falkordb-langchain-js-ts-integration/) — `@falkordb/langchain-ts` confirmed as the only first-class JS graph LangChain integration; server-based (HIGH confidence — official FalkorDB announcement)

---

*Stack research for: DocuMind v3.3 — Kuzu Graph Intelligence*
*Researched: 2026-04-07*
