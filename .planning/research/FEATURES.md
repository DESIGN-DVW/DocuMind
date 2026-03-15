# Feature Research

**Domain:** Documentation Intelligence Platform (developer-facing, agent-callable)
**Researched:** 2026-03-15
**Confidence:** MEDIUM — table stakes drawn from verified DMS/knowledge-graph market research;
differentiators drawn from DocuMind-specific context and MCP ecosystem (officially verified);
anti-features from architectural reasoning and observed developer tool failures.

---

## Context Note

DocuMind is not a general-purpose DMS or a knowledge-base SaaS. It is a documentation intelligence
engine for a developer-controlled multi-repo environment, callable by AI agents via MCP. The primary
consumer is a Claude Code agent running in the DVWDesign ecosystem, not a human clicking a UI.
Feature judgment must be filtered through that lens.

---

## Feature Landscape

### Table Stakes (Users Expect These)

"Users" here means: (1) Claude Code agents invoking MCP tools, and (2) the solo developer running CLI
commands. Missing any of these makes DocuMind feel incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
| ------- | ------------ | ---------- | ----- |
| Full-text search across all repos | Core utility — agents must be able to find docs by keyword | LOW | Already exists via FTS5; table stakes for any knowledge system |
| Incremental indexing (content_hash delta) | Without this, every scan is a full rebuild — unusably slow | LOW | Already exists; verified pattern for large-scale indexing |
| Markdown linting with auto-fix | Standard in any doc toolchain; missing = ecosystem rot | LOW | Already exists; markdownlint + custom DVW001 rules |
| Document metadata (title, category, repo, modified date) | Agents can't filter or sort without metadata | LOW | Already exists via frontmatter + gray-matter parser |
| REST API to query index | All integrations (Claude hooks, CLI, future MCP) depend on this | LOW | Already exists on port 9000 |
| File watcher for real-time re-indexing | Without this, changes go undetected until manual scan | MEDIUM | Exists via chokidar; must stay wired |
| Scheduled scans (hourly incremental, daily full) | Ensures index freshness without manual intervention | LOW | Exists in scheduler; cron jobs are TODOs — must be wired |
| Document deduplication detection | Without this, the same doc exists in 3 places and agents get confused | MEDIUM | Levenshtein + cosine similarity table exists; never populated |
| Staleness detection | Docs drift from reality; agent answers based on stale docs = wrong answers | MEDIUM | freshness_score concept standard in RAG systems; not yet built |
| MCP server with search + read tools | This is the primary agent interface; REST API is secondary | HIGH | Not yet built; required for Step #2 |
| Portable context profile | Without this, DocuMind is hardcoded to DVWDesign — can't deploy elsewhere | HIGH | Not yet built; required for Step #3; JSON config that swaps behavior |

**Sources:** MEDIUM confidence — staleness/freshness scoring pattern confirmed by enterprise RAG research
(ragaboutit.com); MCP tool patterns confirmed by official MCP spec (modelcontextprotocol.io); deduplication
confirmed by Bloomfire / Glean feature listings.

---

### Differentiators (Competitive Advantage)

Features that go beyond what any generic DMS or markdown linter provides. These are where DocuMind
competes on intelligence, not just indexing.

| Feature | Value Proposition | Complexity | Notes |
| ------- | ----------------- | ---------- | ----- |
| Document relationship graph (recursive CTE traversal) | An agent can ask "what docs depend on this one?" and get a path — not just a list | HIGH | Schema + relations.mjs exist; `buildRelationships()` never called; populating the graph is the priority feature |
| 8-type relationship taxonomy (imports, parent_of, supersedes, etc.) | Directional typed edges let agents understand *how* docs relate, not just *that* they relate | MEDIUM | Schema supports it; inference logic must detect these from content (link patterns, dispatch parsing, version strings) |
| Cross-repo keyword cloud (TF-IDF) | Agents see what topics dominate each repo — useful for routing queries and surfacing gaps | MEDIUM | keyword-processor.mjs exists; never runs; natural.js TF-IDF ready |
| Folder hierarchy + Mermaid diagram generation | Visual structure maps for a 14-repo ecosystem — no other tool does this automatically | HIGH | tree-processor + mermaid-processor exist; diagram registry working |
| FigJam URL curation and cross-repo propagation | Curate a diagram URL once, propagate to all 14 repos — eliminates broken diagram links | HIGH | Fully working; only complete end-to-end feature in v2.0 |
| MCP write tools (lint, fix, index, convert, relink) | Agents don't just read — they can fix and maintain docs autonomously | HIGH | Not yet built; major differentiator over read-only MCP servers |
| Context profile (swappable classification + rules + keywords) | Deploy the same engine for code docs, marketing content, ops runbooks — just swap the profile | HIGH | Not yet built; key to Step #3 portability; analogous to .editorconfig but for intelligence |
| Classification tree (hierarchical) + tag flat-list | Hierarchical classification enables drill-down; flat tags enable cross-cutting queries | MEDIUM | Schema evolution needed (tree node + tag tables); significant value for routing agent queries |
| Document summary field | Short auto-generated or manually-set synopsis enables fast agent triage without reading full content | LOW | Currently absent from schema; must be added as part of v3.0 schema evolution |
| Deviation detection (convention drift) | Flags docs that violate established patterns — catches regressions automatically | MEDIUM | deviations table exists; deviation analysis script exists; not wired to scheduler |

**Sources:** MEDIUM confidence — relationship graphs confirmed as primary differentiator in knowledge graph
literature (neo4j.com, Medium/knowledge-graph-systems-2025); MCP write tools pattern inferred from official
MCP spec and absence of write-capable doc MCP servers in the ecosystem (github.com/modelcontextprotocol/servers);
context profiles pattern confirmed by codebase-context-spec (github.com/Agentic-Insights) and opencode issue tracker.

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
| ------- | ------------- | --------------- | ----------- |
| Web dashboard / UI | "I want to see the graph visually" | Solo user; builds a whole front-end dependency for one person; maintenance burden exceeds value; PROJECT.md explicitly defers this | Use `/graph` REST endpoint + Mermaid .mmd files; add a CLI `graph:view` command if needed |
| Semantic / embedding-based search | "TF-IDF misses synonyms" | Requires embedding model, vector DB, GPU budget, chunking strategy — massive complexity increase; FTS5 + TF-IDF is sufficient for 620+ docs in a controlled vocabulary domain | Improve TF-IDF category weights and synonym expansion if false-negative rate proves problematic |
| Real-time collaboration on docs | "Multiple agents editing simultaneously" | SQLite single-writer model; DocuMind is an indexer, not an editor; introduces conflict resolution complexity | DocuMind reads what editors write; agents fix via write tools, not collaborative sessions |
| OAuth / multi-tenant auth | "I want to share this with my team" | Step #1 and #2 are solo-user; adding auth now adds 2–3 weeks of complexity to a system with one user | Revisit for Step #3 SaaS; use API key + HTTPS if needed before then |
| Push notifications / webhooks outbound | "Notify me when staleness detected" | DocuMind is a pull-based daemon; adding push requires subscriber registry, retry logic, failure handling | Poll `/stats` endpoint; add PM2 log alerts; use cron-triggered Slack message if needed |
| Full DOCX editing / roundtrip | "Edit in Word, sync back to Markdown" | DocuMind converts inbound (DOCX→MD); roundtrip editing is a full authoring workflow problem — out of scope | Convert once on ingest; store canonical as Markdown; discard DOCX |
| LLM-generated summaries (API calls per doc) | "Auto-summarize every document on index" | Requires OpenAI/Anthropic API call per doc on every re-index; costs, latency, rate limits; 620+ docs = expensive; stale summaries on content change | Use TF-IDF extractive summary (top 3 sentences by keyword density); or manual summary field in frontmatter |

---

## Feature Dependencies

```text
[Context Profile (JSON config)]
    └──required by──> [Portable deployment / Step #3]
    └──required by──> [Classification tree + tags] (profile defines the tree)
    └──required by──> [Lint rule overrides] (profile swaps markdownlint config)

[Classification tree + tags]
    └──required by──> [Keyword TF-IDF routing] (keywords classified by tree nodes)
    └──enhances──> [Document relationship graph] (categories inform edge weights)

[Document relationship graph]
    └──requires──> [Scheduler wired to buildRelationships()] (graph must be populated)
    └──requires──> [Document indexing] (documents must exist before edges can be built)
    └──enhances──> [Staleness detection] (supersedes edges identify what became outdated)
    └──enables──> [MCP graph read tools] (graph data must exist before tools can query it)

[Keyword TF-IDF extraction]
    └──requires──> [Document indexing] (content must be indexed before keywords extracted)
    └──enables──> [MCP keyword search tools]
    └──enables──> [Document summary field] (extractive summary from top keywords)

[Staleness detection]
    └──requires──> [content_hash tracking] (already exists)
    └──enhances──> [Document relationship graph] (supersedes edges surface staleness)

[MCP server (read tools)]
    └──requires──> [REST API] (already exists — MCP bridges to it)
    └──requires──> [Document indexing] (data must exist)
    └──requires──> [Graph populated] (graph tools need graph data)

[MCP server (write tools)]
    └──requires──> [MCP server (read tools)] (write extends read transport)
    └──requires──> [lint + fix CLI commands] (write tools wrap existing scripts)

[Duplicate detection]
    └──requires──> [Document indexing] (content must be indexed for comparison)
    └──enhances──> [Relationship graph] (duplicates become variant_of edges)

[Deviation detection]
    └──requires──> [Document indexing]
    └──requires──> [Scheduler wired] (deviation runs on daily cron)
```

### Dependency Notes

- **Graph requires scheduler**: `buildRelationships()` exists but is never called. Wiring the scheduler is the critical unlock that populates the graph, which enables MCP graph tools, staleness detection via `supersedes` edges, and duplicate-to-`variant_of` promotion.
- **Context profile gates portability**: Everything in Step #3 depends on the context profile abstraction. It must be designed with the right schema upfront (classification tree, lint config, keyword taxonomy, ingestion sources) or it becomes a rewrite later.
- **MCP write tools depend on existing CLI scripts**: The write MCP tools are wrappers around `fix-markdown.mjs`, `scan-all-repos.mjs`, etc. Those scripts already exist — write tools are primarily wiring, not new logic.
- **Summary field is low-cost but unlocks agent triage**: Adding a `summary` column to the `documents` table costs almost nothing; it enables agents to triage 50 results without reading full content. Prioritize early.

---

## MVP Definition

DocuMind v3.0 MVP = Step #1 (internal tool fully working) + Step #2 (MCP server callable by agents).

### Launch With (v1 = Step #1 + Step #2 complete)

- [ ] Schema evolution: add summary field, classification tree nodes, flat tags — everything downstream depends on this data model
- [ ] Context profile (even minimal): JSON config that externalizes repo paths, classification tree, and lint rules — without this Step #3 is a rewrite
- [ ] Scheduler wired to processors: cron jobs must actually call markdown-processor, keyword-processor, buildRelationships — currently all TODOs
- [ ] Document relationship graph populated: `buildRelationships()` called on schedule; graph edges visible via `/graph` endpoint — this is the stated day-one success test
- [ ] Keyword extraction running: TF-IDF processor on schedule; keywords table populated; `/keywords` endpoint returns real data
- [ ] Staleness detection: freshness score computed on each scan; stale docs surfaced via `/search` filter and `/stats` dashboard
- [ ] Duplicate/similarity detection: similarities table populated on daily cron; duplicates surfaced via `/search?dedupe=true`
- [ ] MCP server (read tools): search, graph, keywords, tree, diagrams — agents can query DocuMind from any Claude Code session
- [ ] MCP server (write tools): index, lint, fix, convert, relink — agents can maintain docs autonomously

### Add After Validation (v1.x = refinement)

- [ ] Deviation detection wired to scheduler — trigger: daily cron produces empty deviations table
- [ ] MCP tool: `find_stale` — surfaces docs with low freshness score; trigger: agents ask about outdated content
- [ ] MCP tool: `find_duplicates` — surfaces similar doc pairs; trigger: agents ask about redundancy
- [ ] Summary auto-generation (extractive TF-IDF) — trigger: summary field exists but is null for most docs after v1 launch
- [ ] Classification confidence scoring — trigger: classification accuracy complaints from agent queries

### Future Consideration (v2+ = Step #3, commercial)

- [ ] Context profile per vertical (code docs, marketing, ops) — required for commercial deployment; defer until Step #1/2 proven
- [ ] Docker packaging — required for self-hosted commercial; defer until product-market fit
- [ ] SQLite-per-tenant via Turso — required for SaaS path; defer until multi-tenant demand confirmed
- [ ] Web dashboard — deferred per PROJECT.md until Step #3; build only if solo CLI proves insufficient for stakeholder demos

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
| ------- | ---------- | ------------------- | -------- |
| Scheduler wired to processors | HIGH | LOW (wiring, not new code) | P1 |
| Document relationship graph populated | HIGH | MEDIUM (inference logic + edge detection) | P1 |
| MCP server read tools | HIGH | MEDIUM (new transport, bridges existing REST) | P1 |
| Schema evolution (summary, tree, tags) | HIGH | LOW (additive migrations) | P1 |
| Context profile (minimal) | HIGH | MEDIUM (JSON schema design + loader) | P1 |
| Keyword TF-IDF running on schedule | MEDIUM | LOW (processor exists, needs wiring) | P1 |
| Staleness detection | MEDIUM | MEDIUM (scoring formula + schema field) | P1 |
| MCP server write tools | HIGH | MEDIUM (wrappers around existing scripts) | P2 |
| Duplicate detection populated | MEDIUM | MEDIUM (similarity scoring on schedule) | P2 |
| Deviation detection wired | MEDIUM | LOW (script exists; scheduler integration) | P2 |
| Document summary field (extractive) | MEDIUM | LOW (TF-IDF top-sentence extraction) | P2 |
| Classification confidence scoring | LOW | MEDIUM | P3 |
| Web dashboard | LOW (solo user) | HIGH | P3 |
| Semantic / embedding search | LOW (FTS5 sufficient) | HIGH | P3 |

**Priority key:**

- P1: Must have for DocuMind v3.0 launch (Step #1 + Step #2)
- P2: Add once core is proven working
- P3: Future consideration — not before Step #3

---

## Competitor Feature Analysis

DocuMind does not compete with general DMS platforms (Confluence, Notion, SharePoint). Its peer set
is specialized developer documentation intelligence tools and knowledge graph systems.

| Feature | Obsidian (knowledge graph) | Glean (enterprise search) | Context7 (library docs) | DocuMind Approach |
| ------- | -------------------------- | ------------------------- | ----------------------- | ----------------- |
| Document relationship graph | YES — bidirectional backlinks + visual graph view | Partial — entity graph from email/Slack | YES — library-to-docs graph | Graph with typed edges (8 types), recursive CTE traversal, queryable via MCP |
| Full-text search | YES — across vault | YES — enterprise-wide | YES — per library | FTS5 across 14 repos, filterable by repo/category/type |
| Duplicate detection | NO (plugin ecosystem only) | YES — semantic deduplication | NO | Levenshtein + cosine similarity; surfaces as `variant_of` graph edges |
| Staleness detection | NO (manual review only) | YES — AI-flagged outdated content | NO | freshness_score per doc; stale docs surfaced in search and stats |
| Markdown linting + auto-fix | NO | NO | NO | markdownlint + DVW001 custom rules; auto-fix across repos |
| MCP tools | NO (uses plugins not MCP) | NO | YES (read-only library docs) | Read + write MCP tools; agents can fix docs, not just read them |
| Portable context profile | NO (vault-local) | NO (cloud-only) | NO (library-specific) | JSON profile swaps classification, lint rules, keyword taxonomy per deployment |
| Multi-repo indexing | NO (single vault) | YES (enterprise-wide) | NO (per library) | 14+ repos; designed to scale to more with context profile |
| Diagram registry + propagation | NO | NO | NO | Fully working; unique to DocuMind |

**Conclusion:** DocuMind's differentiating advantage is the combination of: (1) typed relationship graph
queryable by AI agents via MCP, (2) write-capable MCP tools that allow autonomous doc maintenance, and
(3) cross-repo multi-format coverage including linting, fixing, and diagram propagation. No competitor
in the developer tooling space offers all three. The context profile portability is the commercial
differentiator for Step #3.

---

## Sources

- MCP Tools specification (official, HIGH confidence): [modelcontextprotocol.io/specification/2025-06-18/server/tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- MCP server ecosystem (official GitHub, HIGH confidence): [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)
- Document staleness and freshness scoring patterns (MEDIUM confidence): [ragaboutit.com — Knowledge Decay Problem](https://ragaboutit.com/the-knowledge-decay-problem-how-to-build-rag-systems-that-stay-fresh-at-scale/)
- Duplicate detection approaches (MEDIUM confidence): [glean.com — AI search duplicate detection](https://www.glean.com/perspectives/how-ai-search-tools-identify-duplicate-content-and-outdated-documents)
- Knowledge graph for technical documentation (MEDIUM confidence): [Medium — Ontologies and Knowledge Graphs for Technical Documentation](https://medium.com/@nc_mike/ontologies-and-knowledge-graphs-for-technical-documentation-297a91b52c15)
- Codebase context spec (portable config pattern, LOW confidence — single source): [github.com/Agentic-Insights/codebase-context-spec](https://github.com/Agentic-Insights/codebase-context-spec)
- AI documentation trends 2026 (MEDIUM confidence): [document360.com — Major AI Documentation Trends for 2026](https://document360.com/blog/ai-documentation-trends/)
- Obsidian graph and backlinks (MEDIUM confidence): [deepwiki.com — Internal Links and Graph View](https://deepwiki.com/obsidianmd/obsidian-help/4.2-internal-links-and-graph-view)
- TF-IDF keyword extraction (HIGH confidence, well-established technique): [geeksforgeeks.org — TF-IDF](https://www.geeksforgeeks.org/machine-learning/understanding-tf-idf-term-frequency-inverse-document-frequency/)

---

*Feature research for: Documentation Intelligence Platform (DocuMind v3.0)*
*Researched: 2026-03-15*
