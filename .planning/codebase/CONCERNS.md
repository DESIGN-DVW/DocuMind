# Codebase Concerns

**Analysis Date:** 2026-03-15

## Tech Debt

### Incomplete API endpoint integrations:

- Issue: `/scan`, `/index`, and `/convert` endpoints in `daemon/server.mjs` are queued but not integrated with actual processors

- Files: `daemon/server.mjs` (lines 184-207)

- Impact: API clients receive "queued" responses but work is never actually performed; endpoints are non-functional stubs

- Fix approach: Wire endpoints to async task queue or import actual scan/index/convert modules and execute them; add proper status tracking

### Incomplete scheduler cron jobs:

- Issue: Hourly incremental scan, daily full scan, and weekly analysis tasks have placeholder TODOs and don't actually execute scans

- Files: `daemon/scheduler.mjs` (lines 44, 68, 75)

- Impact: Scheduled maintenance doesn't run; database becomes stale; no automatic deviations/similarities detection

- Fix approach: Import and call `scan-all-repos.mjs`, `analyze:similarities`, `analyze:deviations` modules within cron callbacks; add proper error handling

### Watcher processor routing incomplete:

- Issue: File watcher detects changes but doesn't actually trigger reprocessing via markdown/pdf/word processors

- Files: `daemon/watcher.mjs` (lines 108-119)

- Impact: File changes detected but not indexed; users see stale content; no re-linting on save

- Fix approach: Import processors and execute async; add database update/index calls; handle errors gracefully

### Database connection management:

- Issue: Query utility functions create new database connections per query and close immediately, bypassing connection pooling

- Files: `scripts/db/query-utils.mjs` (multiple functions call `getDatabase()` then `db.close()`)

- Impact: High file descriptor usage on sustained load; potential connection exhaustion; slow query performance

- Fix approach: Implement singleton database instance in daemon context; reuse connections across request lifecycle; close only on shutdown

## Known Bugs

### Database migration not idempotent:

- Symptoms: Running `npm run db:init` multiple times against existing database may fail or leave database in inconsistent state

- Files: `scripts/db/init-database.mjs` (line 97: hardcoded version '1.0.0')

- Trigger: Re-initializing existing database after schema changes

- Workaround: Manually delete `data/documind.db` and WAL files before reinitializing

- Fix approach: Implement schema versioning table; check existing version; only apply migrations newer than current version

### Watcher debounce Set serialization:

- Symptoms: Multiple near-simultaneous file changes may be lost or duplicated during debounce window

- Files: `daemon/watcher.mjs` (lines 34, 54)

- Trigger: Rapid file saves (e.g., editor auto-save + manual save)

- Workaround: Ensure 2-second stabilityThreshold before close (already in config)

- Fix approach: Use Map with timestamps instead of Set<JSON.stringify>; deduplicate based on path+hash

### RTF conversion text extraction fragility:

- Symptoms: RTF files with complex formatting or embedded objects produce garbled text

- Files: `processors/word-processor.mjs` (lines 102-108: regex-based RTF parsing)

- Trigger: RTF files with nested groups, control sequences with parameters

- Workaround: Convert RTF to DOCX first, then use mammoth

- Fix approach: Replace hand-written RTF parser with proper library (e.g., `rtf-parser`); validate extracted text quality

## Security Considerations

### Database file permissions not enforced:

- Risk: SQLite database file at `data/documind.db` has standard Unix permissions (644); any user on system can read

- Files: `daemon/server.mjs`, `scripts/db/init-database.mjs`

- Current mitigation: None; database may contain sensitive document content

- Recommendations: Set umask to 0077 before creating DB; chmod database to 0600; use encrypted SQLite if handling secrets

### No input validation on search endpoints:

- Risk: FTS5 search query on `/search` endpoint accepts raw user input; potential SQL injection via FTS5 syntax

- Files: `daemon/server.mjs` (lines 99-125)

- Current mitigation: Parameterized queries via `.prepare()` and `all(...params)` provide basic protection

- Recommendations: Validate query length; implement rate limiting; sanitize FTS5 operators; add query logging

### Path traversal in file operations:

- Risk: Relink processor and watcher operate on file paths from database/requests without validation

- Files: `processors/relink-processor.mjs` (walkAndReplace), `daemon/watcher.mjs` (file path handling)

- Current mitigation: Path construction via `path.join()` which normalizes

- Recommendations: Validate all paths against allowed repository roots; reject absolute paths or `../` traversals

### API endpoint lacks authentication:

- Risk: All endpoints (POST `/scan`, `/diagrams/relink`, `/hook`) have no auth check

- Files: `daemon/server.mjs` (lines 184-215, 273-361)

- Current mitigation: None; endpoint is internally networked only (localhost:9000)

- Recommendations: Add API key header validation; implement basic auth; restrict port to loopback-only binding

## Performance Bottlenecks

### Large document content stored in memory:

- Problem: Full document content stored in database and loaded into memory for FTS searches

- Files: `daemon/server.mjs` (lines 103-124), `processors/markdown-processor.mjs` (full content variable)

- Cause: Using FTS5 content='documents' which stores full content for snippet generation

- Improvement path: Use external content storage; keep only metadata + content hash in DB; load content on-demand; implement content streaming for large files

### Query-per-function database pattern:

- Problem: Every query utility function opens and closes database; no connection pooling or caching

- Files: `scripts/db/query-utils.mjs` (599 lines of individual query functions)

- Cause: Design assumes script-level execution, not daemon context

- Improvement path: Convert to daemon API calls; implement query result caching; use prepared statement cache; reuse database instance

### Similarity detection brute-force approach:

- Problem: Finding similar documents via `findSimilarDocuments()` requires O(n) document comparisons

- Files: `scripts/db/query-utils.mjs` (function around line 136-150)

- Cause: No indexing on similarity scores; full table scan required

- Improvement path: Build LSH (Locality-Sensitive Hashing) index; compute similarity incrementally; batch similarity checks; cache results

### Recursive folder walk on every tree request:

- Problem: `/tree/:repo` endpoint queries folder hierarchy from scratch; no caching

- Files: `daemon/server.mjs` (lines 168-181), `processors/tree-processor.mjs`

- Cause: Folders are stored in database but no materialized view or cache layer

- Improvement path: Cache folder tree JSON for 1 hour; invalidate on scan completion; add etag-based conditional requests

### Diagram generation with immediate disk I/O:

- Problem: Generating diagrams writes .mmd files synchronously before database insert

- Files: `processors/mermaid-processor.mjs` (lines 44-46)

- Cause: Potential race condition if process crashes between write and DB update

- Improvement path: Use database transaction; write temp file first; rename on commit; use async I/O with error recovery

## Fragile Areas

### Relink propagation across repos:

- Files: `processors/relink-processor.mjs` (lines 70-85)

- Why fragile: Catches all errors silently; silently skips repos if path doesn't exist; modifies multiple repos without rollback

- Safe modification: Add dry-run mode; log each modified file; validate repo paths before modification; implement transaction-like semantics with rollback

- Test coverage: No tests visible for propagation success/failure scenarios; cross-repo integration untested

### Watcher event processing:

- Files: `daemon/watcher.mjs` (lines 87-122)

- Why fragile: TODO markers show incomplete processor routing; no error handling in file processing loop; database errors would crash watcher

- Safe modification: Wrap file processing in try-catch; implement retry logic with exponential backoff; validate file existence before DB operations

- Test coverage: No tests visible; watcher behavior under heavy file change load unknown

### Custom error pattern matching:

- Files: `scripts/fix-custom-errors.mjs` (557 lines), `config/custom-error-patterns.json`

- Why fragile: Regex patterns from JSON config applied globally; no validation of pattern syntax; could match unintended content

- Safe modification: Pre-compile and validate all regex patterns on startup; add pattern test suite; require explicit file confirmation before applying fixes

- Test coverage: Patterns marked "automated" vs "ai-assisted" but no visible test coverage; false-positive rates unknown

### Diagram registry markdown parsing:

- Files: `processors/relink-processor.mjs` (lines 108-120)

- Why fragile: Parses table by splitting on `|` without handling escaped pipes or multiline cells; assumes 5-7 column format exactly

- Safe modification: Use proper markdown table parser; validate column count; handle edge cases (extra whitespace, empty cells)

- Test coverage: No visible tests for registry parsing with malformed input

## Scaling Limits

### SQLite single-writer limitation:

- Current capacity: One writer at a time; concurrent writes queue up

- Limit: With high-frequency file changes (>10 changes/sec), write queue backs up; API responses delay

- Scaling path: Migrate to PostgreSQL for concurrent writes; implement write queue with background worker; batch writes into transactions

### In-memory content storage:

- Current capacity: Full content of 620+ markdown files in database

- Limit: Database file already 125 MB; adding PDFs/DOCX will bloat further; memory usage grows with document count

- Scaling path: Move content to blob storage (S3, GCS); keep metadata + content hash in DB; implement content streaming; implement retention policy

### Single daemon process:

- Current capacity: Single Express server on port 9000 handles all API requests

- Limit: Node.js single-threaded; CPU-bound tasks (similarity detection, PDF parsing) block I/O

- Scaling path: Implement worker thread pool; separate API server from background processors; use PM2 cluster mode; horizontal scaling with load balancer

### Document relationship graph traversal:

- Current capacity: Recursive CTE queries on `doc_relationships` table

- Limit: No pagination on graph queries; `/graph` endpoint LIMIT 500 may miss relationships; deep traversals (>5 hops) become slow

- Scaling path: Implement iterative BFS instead of recursive CTE; add depth-based query hints; cache relationship results; index on (source, target, type)

### Folder tree hierarchy storage:

- Current capacity: Folder nodes table stores all directories

- Limit: Deeply nested directories (>10 levels) slow to traverse; no rollup statistics

- Scaling path: Add parent_path index; implement rollup aggregation (doc_count pre-computed); cache tree JSON for each repo

## Dependencies at Risk

### Mammoth library RTF support gaps:

- Risk: RTF conversion via mammoth is actually via HTML intermediate; doesn't handle legacy RTF well

- Impact: Complex RTF documents fail or produce garbled output; users can't import Word docs reliably

- Migration plan: Add `rtf-parser` for native RTF parsing; or standardize on DOCX input format; validate conversion quality

### pdf-parse dependency:

- Risk: pdf-parse doesn't handle all PDF features (forms, embedded fonts, images); text extraction quality varies

- Impact: PDF indexing may miss content; search results incomplete for complex PDFs

- Migration plan: Switch to `pdfjs-dist` (more complete); implement OCR fallback for scanned PDFs; add manual indexing override

### Natural.js TF-IDF implementation:

- Risk: Natural.js keyword extraction is simplistic; no stemming, stop word filtering configurable only via code

- Impact: Keywords may be verbose or miss semantic relationships; keyword cloud less useful

- Migration plan: Use `compromise` or `natural`'s advanced token filtering; train custom NLP models for domain; manual keyword curation

### Chokidar file watcher stability:

- Risk: Chokidar has known issues on macOS with many files; sometimes misses file events

- Impact: File changes not detected; database falls out of sync with filesystem

- Migration plan: Implement periodic full scan as fallback; add inotify on Linux; consider commercial watcher alternatives

### Better-sqlite3 WAL mode trade-offs:

- Risk: WAL mode uses 2x disk space; `-shm` and `-wal` files may persist on crash

- Impact: Unexpected disk growth; recovery on unclean shutdown is slow

- Migration plan: Monitor WAL file sizes; implement WAL cleanup script; consider journal_mode=PERSIST for lower overhead

## Missing Critical Features

### No database backup mechanism:

- Problem: Single `documind.db` file is single point of failure; no versioning or recovery

- Blocks: Long-term reliance; integration with critical RootDispatcher workflows

- Recommendation: Implement automated daily backups; version database snapshots; add restore testing

### No transaction support in processors:

- Problem: Multi-file operations (relink, bulk update) lack atomic semantics

- Blocks: Safe concurrent operations; recovery from partial failures

- Recommendation: Wrap processor operations in transactions; implement rollback on error; add idempotency checksums

### No API rate limiting:

- Problem: Endpoints accept unlimited requests; DOS-able by concurrent clients

- Blocks: Production deployment in shared environment

- Recommendation: Add rate limiter middleware; throttle by IP/API key; implement circuit breaker

### No audit logging:

- Problem: No record of who changed what diagram/document when

- Blocks: Compliance, debugging, accountability

- Recommendation: Add audit table; log all mutations; include user/ip/timestamp; implement audit query API

## Test Coverage Gaps

### No daemon integration tests:

- What's not tested: End-to-end flows like "POST /scan → processes files → updates database → GET /stats reflects changes"

- Files: `daemon/server.mjs`, `daemon/scheduler.mjs`

- Risk: Refactoring daemon code may break real workflows without detection

- Priority: High — daemon is critical path

### No processor integration tests:

- What's not tested: Converting DOCX → indexing → searching; PDF → keyword extraction; relinking propagation

- Files: All `processors/*.mjs` modules

- Risk: Processors work in isolation but may fail in actual workflow

- Priority: High — processors are core functionality

### No database schema migration tests:

- What's not tested: Running migrations on existing databases; idempotency; rollback

- Files: `scripts/db/init-database.mjs`, schema.sql

- Risk: Database initialization fails in production; data loss on failed migration

- Priority: Critical — data integrity

### No error recovery tests:

- What's not tested: Watcher behavior on disk full, PDF parse failure, database lock timeout

- Files: `daemon/watcher.mjs`, processors, scheduler

- Risk: Silent failures; data inconsistency; daemon crash without restart

- Priority: High — reliability

### No concurrency tests:

- What's not tested: Multiple simultaneous requests to API; multiple file changes during processing

- Files: `daemon/server.mjs` endpoints

- Risk: Race conditions; corrupted database state; lost updates

- Priority: Medium — may not occur in practice but dangerous if it does

---

---

Concerns audit: 2026-03-15
