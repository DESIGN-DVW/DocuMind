# Phase 1: Schema Migration Foundation - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

## Phase Boundary

Evolve the live SQLite database safely with versioned migrations. Add `summary TEXT`, `classification TEXT`, and `document_tags` table to the existing schema with 8K+ indexed documents. Create a migration system that protects data and enables future schema changes. Remove hardcoded DVWDesign-specific CHECK constraints.

## Implementation Decisions

### Migration safety

- Auto-backup the .db file before every migration run (copy to `documind.db.bak-{timestamp}`)
- Each migration wrapped in a transaction — all-or-nothing, rollback on failure
- Migration files named sequentially: `001-add-summary.sql`, `002-add-classifications.sql`, etc.
- `schema_migrations` table tracks applied migrations with version and timestamp
- `npm run db:reset` requires `--force` flag and prints a loud warning — no silent corpus destruction

### Summary generation

- Extractive hierarchy for summary content: 1st frontmatter `description:` field, 2nd first non-heading paragraph, 3rd title + keywords fallback
- Target length: 1-2 sentences (~100-200 characters)
- Backfill all 8K existing documents during migration (not deferred to scheduler)

### Classification paths

- Classification tree organized by function: `engineering/`, `operations/`, `guides/`, `references/`
- Materialized path format stored as TEXT: `engineering/architecture/adrs`
- Path-based classification rules: `docs/api/**` maps to `engineering/api-docs`, `**/CLAUDE.md` maps to `engineering/architecture`
- Docs that don't match any rule assigned `uncategorized` (visible bucket showing where rules need to be added)
- Classification tree shape lives in the context profile, not hardcoded in schema

### Claude's Discretion

- Tag extraction behavior (threshold, max per doc) — not discussed, Claude decides
- Exact classification tree depth and naming below top level
- FTS5 rebuild strategy during migration
- How to handle documents that already have a `category` value (migration from old field)

## Specific Ideas

- Research flagged that FTS5 external content tables need explicit `INSERT INTO documents_fts(documents_fts) VALUES('rebuild')` after bulk writes — migration must include this
- Research flagged that `schema.sql` has hardcoded CHECK constraints with DVWDesign-specific enum values — these must be removed or made generic as part of SCHM-05
- The `category TEXT` field on documents currently exists — migration should rename/migrate it to `classification TEXT` to avoid confusion

## Deferred Ideas

- None — discussion stayed within phase scope

---

Phase: 01-schema-migration-foundation
Context gathered: 2026-03-15
