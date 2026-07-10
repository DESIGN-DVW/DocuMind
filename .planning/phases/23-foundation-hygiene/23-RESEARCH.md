# Phase 23: Foundation & Hygiene - Research

**Researched:** 2026-07-10
**Domain:** Repo hygiene (git index surgery), env var scaffolding, SQLite versioned migrations, Docker secret hygiene
**Confidence:** HIGH

## Summary

Phase 23 is almost entirely mechanical — it does not introduce any new runtime dependency, library, or architecture. Every pattern it needs already exists in this repo and just needs to be extended: a numbered-migration system (`scripts/db/migrations/*.sql` + `npm run db:migrate`), an `.env.example` convention (`config/env.mjs` + section-commented `.env.example`), and an existing `.gitignore`/`.dockerignore` pair that already handles `.env` correctly. The only genuinely new artifact is the `slide_pipeline_runs` table + `latest_slide_runs` view, and there is a directly analogous existing table (`scan_history`) to model it on.

**Primary recommendation:** Do not invent new mechanisms. (1) `git rm --cached` the 6 already-tracked binary/HTML slide exports and add `docs/slides/**/*.{html,pdf,pptx}` to `.gitignore`. (2) Extend the existing `.env.example` with a new `# PRESENTATION PIPELINE` section following the existing style. (3) Add `scripts/db/migrations/009-slide-pipeline-runs.sql` following the `006-obsolescence-signals.sql` / `scan_history` pattern, run via the existing `npm run db:migrate`. (4) `.dockerignore` already excludes `.env` — this criterion is largely a verification task (build + `docker history`), not new work.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
| - | - | - |
| FOUND-01 | Rendered slide exports (HTML/PDF/PPTX) are gitignored; stale committed binaries removed from the git index without deleting local copies (no history rewrite) | Pitfall 1 gives the exact, verified list of the 6 currently-tracked files and the correct `git rm --cached` scoping (per-file, not directory-wide, to avoid untracking the `.md` sources). Pitfall 2 gives the correct narrow `.gitignore` glob (`docs/slides/**/*.{html,pdf,pptx}`) that won't collide with other tracked `.html` files elsewhere in the repo (JSDoc output, dashboard pages). Open Question 2 covers the exact command-invocation style. |
| FOUND-02 | `.env.example` documents all pipeline variables (DEEPL_API_KEY, FTP_HOST/USER/PASSWORD/REMOTE_PATH, SOFFICE_PATH) — no real secrets in repo or Docker image | Architecture Pattern 3 gives the exact existing section-banner style to match, plus concrete safe placeholder values for each of the 6 vars. Pitfall 4 covers the secret-leakage risk and how to check for it before committing. Open Question 1 flags the `config/env.mjs` wiring-now-vs-later decision for the planner. |
| FOUND-03 | `slide_pipeline_runs` ledger table + `latest_slide_runs` view exist via versioned migration | Pattern 1 identifies the exact migration-file convention and the next available number (`009`). Pattern 2 provides a verified-compatible `ROW_NUMBER()`-based view definition. The Code Examples section gives a full draft migration file (table + indexes + view) synthesized from this repo's own `scan_history`/`conversions` precedents, plus the exact `sqlite3` CLI verification commands the success criterion requires. Pitfall 3 explains why this must go through `scripts/db/migrate.mjs` rather than an inline `server.mjs` table (as happened, incompletely, with migration 008). |

</phase_requirements>

## Standard Stack

No new libraries are needed for this phase. It is git/SQL/env-file work only.

### Core

| Library | Version | Purpose | Why Standard |
| --------- | --------- | --------- | -------------- |
| `better-sqlite3` | `^12.6.2` (bundles SQLite 3.53.0) | Runs the migration SQL | Already the project's only DB driver |
| Node 22 `process.loadEnvFile()` | built-in | Loads `.env` into `process.env` | Already used by `config/env.mjs`; no `dotenv` package in this repo |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ------------ | ----------- | ---------- |
| Hand-editing `.gitignore`/`git rm --cached` | `git filter-repo` / BFG history rewrite | Explicitly rejected — see REQUIREMENTS.md "Out of Scope": "Git history rewrite for stale binaries... force-push disruption not worth ~8MB; rm --cached + gitignore suffices" |
| Numbered SQL migration files | Inline `CREATE TABLE IF NOT EXISTS` in `daemon/server.mjs` startup (as done for `action_log` in migration 008 — see Pitfall 3) | Phase 23 success criterion explicitly says "the **versioned migration**" — use the `scripts/db/migrations/` + `npm run db:migrate` path, not an inline startup table |

**Installation:** None required — no `npm install` for this phase.

## Architecture Patterns

### Recommended file changes for this phase

```text
.gitignore                              # add docs/slides export-file patterns
.dockerignore                           # already excludes .env — verify only
.env.example                            # add PRESENTATION PIPELINE section
scripts/db/migrations/
└── 009-slide-pipeline-runs.sql         # new — table + view
docs/slides/
├── internal/2026-05-21-figma-ai-internal-deck.{html,pdf,pptx}   # git rm --cached (kept on disk)
└── external/2026-05-21-figma-ai-pitch-deck.{html,pdf,pptx}      # git rm --cached (kept on disk)
```

### Pattern 1: Versioned SQL migration (this repo's established convention)

**What:** Every schema change ships as `scripts/db/migrations/{NNN}-{slug}.sql`, applied in lexicographic order by `scripts/db/migrate.mjs` via `npm run db:migrate`. Applied versions are tracked in a bootstrapped `schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT, description TEXT)` table (created inline by `migrate.mjs` itself before it reads migration files — this is the one legitimate exception to "no inline CREATE TABLE"). `migrate.mjs` also takes a full `.db`/`.db-wal`/`.db-shm` backup (`{db}.bak-{ISO-timestamp}`) before applying anything, and wraps each migration + its `schema_migrations` insert in a single `db.transaction()`.
**When to use:** Always, for any new table/view/column in this repo.
**Example (existing migration 006, closely analogous to what this phase needs):**

```sql
-- Source: scripts/db/migrations/006-obsolescence-signals.sql
CREATE TABLE IF NOT EXISTS obsolescence_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE,
  confidence_score REAL NOT NULL CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  flag_label TEXT NOT NULL CHECK (flag_label IN ('obsolete', 'redundant', 'stale', 'needs-update')),
  detected_at TEXT NOT NULL,
  dismissed_until TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obs_confidence ON obsolescence_signals(confidence_score DESC);
```

**Next migration number is `009`** — files `001` through `008` already exist (`008-action-log.sql` is the most recent, dated May 17). Confirmed by `ls scripts/db/migrations/`.

**Existing run-ledger table to model `slide_pipeline_runs` on (this repo's own precedent for "one row per run, started/completed timestamps, status enum, duration, error"):**

```sql
-- Source: scripts/db/schema.sql (scan_history table, already in production use)
CREATE TABLE IF NOT EXISTS scan_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_started TEXT NOT NULL,
  scan_completed TEXT,
  repositories_scanned INTEGER,
  documents_found INTEGER,
  duration_ms INTEGER,
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  error TEXT
);
```

### Pattern 2: `latest_X` view via window function

**What:** SQLite window functions (`ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)`) are available and safe to use — confirmed both in the runtime driver (better-sqlite3 bundles SQLite **3.53.0**) and the system `sqlite3` CLI the success criteria require ("queryable via the sqlite3 CLI", confirmed present at `/usr/bin/sqlite3`, version **3.43.2**). Both versions are far past SQLite 3.25 (2018), when window functions landed — no compatibility risk.
**When to use:** For `latest_slide_runs` — "most recent run per deck" is exactly the `ROW_NUMBER() OVER (PARTITION BY deck_path ORDER BY started_at DESC)` pattern; a plain `MAX(started_at) GROUP BY deck_path` join also works and is simpler if only scalar columns are needed. No existing view in `schema.sql` currently uses window functions (`stale_diagrams`, `repo_keyword_cloud`, etc. are all plain filters/joins) — this will be the first, but nothing in the stack blocks it.
**Example:**

```sql
-- New pattern for this phase — no direct precedent in schema.sql, but standard SQLite
CREATE VIEW IF NOT EXISTS latest_slide_runs AS
SELECT * FROM (
  SELECT
    r.*,
    ROW_NUMBER() OVER (PARTITION BY r.deck_path ORDER BY r.started_at DESC) AS rn
  FROM slide_pipeline_runs r
)
WHERE rn = 1;
```

### Pattern 3: `.env.example` section convention

**What:** `.env.example` is organized into `# ====...====` banner-delimited sections (`SERVER`, `DATABASE`, `PROFILE`, `REPOSITORY ROOT`, `CRON SCHEDULES`, `MCP TRANSPORT`, etc.), each with inline comments explaining defaults, and secrets commented out with a placeholder rather than left blank/uncommented. `config/env.mjs` is the single source of truth that reads each var with `process.env.X ?? default` and documents it in the CLAUDE.md env var table.
**Example (existing style to match exactly):**

```bash
# Source: .env.example (existing MCP TRANSPORT section, as a template for the new PRESENTATION PIPELINE section)
# ============================================================================
# MCP TRANSPORT
# ============================================================================

# MCP transport mode: stdio (default, local Claude Code) or http (remote consumers)
DOCUMIND_MCP_MODE=stdio

# Bearer token(s) for MCP HTTP endpoint (required when DOCUMIND_MCP_MODE=http)
# Comma-separated for multiple consumers
# DOCUMIND_MCP_TOKEN=your-secret-token-here
```

New section should follow the same shape — real secrets (`DEEPL_API_KEY`, `FTP_PASSWORD`) commented out with an obvious placeholder (e.g. `DEEPL_API_KEY=your-deepl-api-key-here`), non-secret operational values (`FTP_REMOTE_PATH`, `SOFFICE_PATH`) can be shown uncommented with a realistic-looking placeholder path since they aren't credentials.

**CLAUDE.md's own env var table must also be updated** (`/Users/Shared/htdocs/github/DVWDesign/DocuMind/CLAUDE.md` has a full `| Variable | Default | Description |` table under "Environment Configuration" — this is the ecosystem convention, listed explicitly in that file, and every existing env var is documented there). Whether Phase 23 actually wires these vars into `config/env.mjs` as exported constants is a judgment call for the planner — REQUIREMENTS.md only requires `.env.example` documentation in this phase (FOUND-02); `config/env.mjs` wiring is naturally consumed by Phase 24 (render, `SOFFICE_PATH`), Phase 25 (translate, `DEEPL_API_KEY`), and Phase 28 (deploy, `FTP_*`). Recommend wiring the exports now in Phase 23 alongside the `.env.example` entries (cheap, keeps `config/env.mjs` the single source of truth from day one) but this is not a hard blocker for FOUND-02's success criterion, which only names `.env.example`.

### Anti-Patterns to Avoid

- **Inline `CREATE TABLE IF NOT EXISTS` in `daemon/server.mjs` startup code:** This repo has one instance of this (the `action_log` table, added at `daemon/server.mjs:64`, "Applied by server.mjs at startup" per the comment in `scripts/db/migrations/008-action-log.sql`). It works but is NOT tracked in `schema_migrations` and bypasses the backup-before-migrate step. The Phase 23 success criterion explicitly says "the versioned migration" — use `scripts/db/migrate.mjs`, not this shortcut.
- **Restrictive `CHECK` constraints tied to DVWDesign-specific values:** Migration `005-remove-check-constraints.sql` deliberately removed a `CHECK (relationship_type IN (...8 hardcoded values...))` constraint specifically because it baked DVWDesign-specific values (`dispatched_to`) into a column meant to be portable across repos/orgs. This does not block using `CHECK` on this phase's own new column (e.g. `CHECK (status IN ('pending','running','success','failed','skipped'))`) since pipeline run status is a small, stable, non-org-specific enum — same category as the still-`CHECK`-constrained `scan_history.status` and `obsolescence_signals.flag_label`, which were untouched by migration 005. Just don't encode anything DVWDesign-org-specific (e.g. hardcoded deck names) into a `CHECK`.
- **`git rm` without `--cached`:** Would delete the files from disk too, violating success criterion 1 ("remain present on disk locally"). Must be `git rm --cached <path>` for each of the 6 files (or `git rm -r --cached docs/slides/internal docs/slides/external` scoped carefully — but note `docs/slides/**/*.md` must stay tracked, only the export files should be removed. Do not blanket-`--cached` whole directories; target the `.html`/`.pdf`/`.pptx` files explicitly, e.g. `git rm --cached docs/slides/internal/*.pdf docs/slides/internal/*.pptx docs/slides/internal/*.html docs/slides/external/*.pdf docs/slides/external/*.pptx docs/slides/external/*.html`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --------- | ------------- | ------------- | ----- |
| Migration ordering/tracking | Custom "have I run this SQL yet" bookkeeping | `scripts/db/migrate.mjs` + `schema_migrations` table (already exists) | Already handles backup, transactional apply, idempotent skip, and lexicographic ordering |
| `.env` loading | `dotenv` package | Node 22 `process.loadEnvFile()` (already wired in `config/env.mjs`) | This repo deliberately has zero `dotenv` dependency; adding one would be inconsistent with the rest of the codebase |
| "Most recent row per group" query | Manual max-id subquery loop in JS | SQL `ROW_NUMBER() OVER (PARTITION BY ...)` in the view definition | Both driver (3.53.0) and CLI (3.43.2) support window functions; keeps the "latest per deck" logic in SQL where every other view lives |

**Key insight:** This phase's job is to extend three existing, working mechanisms (gitignore hygiene, `.env.example` conventions, numbered SQL migrations) — not to design anything new. Anywhere the plan reaches for a new pattern, check `scripts/db/schema.sql`, `scripts/db/migrations/*.sql`, and `.env.example` first.

## Common Pitfalls

### Pitfall 1: `git rm --cached` misses files or removes the wrong ones

**What goes wrong:** Blanket-removing a whole directory from the index (e.g. `git rm -r --cached docs/slides/`) would also untrack the `.md` source files, which must stay tracked (they are the hand-edited source of truth per STATE.md: "EN Marp .md decks in docs/slides/ are the ONLY hand-edited slide artifact").
**Why it happens:** `docs/slides/{internal,external}/` mixes source `.md` with generated `.html`/`.pdf`/`.pptx` in the same directories, so a directory-level `rm --cached` is too broad.
**How to avoid:** Target file extensions explicitly. Exact list of currently-tracked files confirmed via `git ls-files | grep -iE 'slides'` on 2026-07-10:

```text
docs/slides/external/2026-05-21-figma-ai-pitch-deck.html
docs/slides/external/2026-05-21-figma-ai-pitch-deck.pdf
docs/slides/external/2026-05-21-figma-ai-pitch-deck.pptx
docs/slides/internal/2026-05-21-figma-ai-internal-deck.html
docs/slides/internal/2026-05-21-figma-ai-internal-deck.pdf
docs/slides/internal/2026-05-21-figma-ai-internal-deck.pptx
```

(The corresponding `.md` files ARE tracked and must remain tracked — do not touch them. Both `.md` files currently show as locally modified in `git status`, unrelated to this phase — a prior "Buzz-cleaned" content edit per STATE.md session log.)
**Warning signs:** `git status` showing the `.md` files as deleted/untracked after the hygiene commit — if that happens, the `--cached` flag was dropped or scope was too broad.

### Pitfall 2: `.gitignore` pattern is too broad and blocks other repos' HTML docs

**What goes wrong:** A naive `*.html` or `*.pdf` blanket rule in `.gitignore` would also hide `docs/07-api/jsdoc/*.html` (currently tracked, generated JSDoc output that IS meant to be committed) and `dashboard/diagrams.html` / `dashboard/obsolete.html` (tracked app pages, not generated exports).
**Why it happens:** The repo already has multiple legitimate uses of `.html` files that must stay tracked; a project-wide extension-based ignore would silently un-ignore-exempt them only if `!` negation patterns are added afterward, which is error-prone.
**How to avoid:** Scope the new `.gitignore` entries to the `docs/slides/` path specifically, e.g.:

```gitignore
# Presentation pipeline: rendered exports are regenerated on demand, never committed
docs/slides/**/*.html
docs/slides/**/*.pdf
docs/slides/**/*.pptx
```

This mirrors the existing `.gitignore`'s own pattern of narrow, path-scoped exclusions (`data/kuzu-smoke-test/`, `data/documind.kuzu/`) rather than global extension bans.
**Warning signs:** `git status` after the change showing `docs/07-api/jsdoc/*.html` or `dashboard/*.html` as newly-ignored/untracked-looking — check with `git check-ignore -v <path>` on those files after editing `.gitignore`.

### Pitfall 3: Two competing "how tables get created" patterns already coexist

**What goes wrong:** Migration `008-action-log.sql` exists as a file in `scripts/db/migrations/` but is **not yet applied** via `schema_migrations` (confirmed: querying `schema_migrations` on the live `data/documind.db` returns versions `001` through `007` only — `008` is missing even though `action_log` already exists as a table, because `daemon/server.mjs` creates it inline with `CREATE TABLE IF NOT EXISTS` at startup, bypassing the migration runner entirely).
**Why it happens:** The migration file for `action_log` appears to have been written as documentation/backup after the fact, not as the actual mechanism that created the table.
**How to avoid:** For `slide_pipeline_runs`, use ONLY the versioned-migration path (`009-slide-pipeline-runs.sql` + `npm run db:migrate`) — do not also add an inline `CREATE TABLE IF NOT EXISTS` in `daemon/server.mjs`. Running `npm run db:migrate` after adding migration 009 should apply both `008` (currently pending/no-op since the table already exists — `CREATE TABLE IF NOT EXISTS` will silently succeed) and `009` in the same run; verify `schema_migrations` shows both `008-action-log` and `009-slide-pipeline-runs` as applied afterward.
**Warning signs:** `slide_pipeline_runs` existing in `sqlite_master` but absent from `schema_migrations` — indicates it was created some other way (inline code, manual `sqlite3` session) rather than through the intended migration path, which would fail the "Running the versioned migration creates..." success criterion in spirit even if the table technically exists.

### Pitfall 4: `.env.example` secrets committed as real-looking values

**What goes wrong:** FOUND-02 explicitly requires placeholder values, not real secrets. The existing `.env.example` already models this correctly (e.g. `DOCUMIND_MCP_TOKEN=your-secret-token-here`, commented out) — the temptation with FTP/DeepL vars is to fill in a "plausible" host/path that's actually a real value from local `.env` testing.
**Why it happens:** Copy-paste from a working local `.env` during testing.
**How to avoid:** Before committing, diff the new `.env.example` section against local `.env` (if one exists) to confirm no accidental value leakage. Use obviously-fake placeholders: `DEEPL_API_KEY=your-deepl-api-key-here`, `FTP_HOST=ftp.example.com`, `FTP_USER=your-ftp-username`, `FTP_PASSWORD=your-ftp-password`, `FTP_REMOTE_PATH=/public_html/slides`, `SOFFICE_PATH=/Applications/LibreOffice.app/Contents/MacOS/soffice` (this one is a real *path convention*, not a secret — safe to show as a realistic default/comment per STATE.md's own prereq-gaps note: "LibreOffice `soffice` not on PATH... resolve /Applications/LibreOffice.app/Contents/MacOS/soffice").
**Warning signs:** `git diff --cached .env.example` showing anything that looks like a real hostname, credential, or token rather than an obvious placeholder.

### Pitfall 5: `.dockerignore` criterion is assumed to need new work when it's already mostly satisfied

**What goes wrong:** Success criterion 4 says "`.dockerignore` excludes `.env`" — this is **already true today** (`.dockerignore` line 6 is `.env`, confirmed 2026-07-10), and `Dockerfile` additionally has a defense-in-depth `RUN rm -f data/documind.db data/*.db-wal data/*.db-shm .env` safety line before `USER documind`. A plan that treats this as a from-scratch build task will waste effort; a plan that skips verification entirely risks missing a regression.
**Why it happens:** The success criterion reads like new work but is actually mostly a regression-test/verification task given the current repo state.
**How to avoid:** Treat this success criterion as "verify, don't rebuild": run `docker build`, then `docker history --no-trunc <image>` and/or `docker run --rm <image> cat .env` (should fail — file absent) to confirm no secret is baked into any layer. Only add new `.dockerignore` lines if the Phase 23 plan introduces new files that could carry secrets (e.g. a local `.env.test` or pipeline-specific secret file) — none are currently planned.
**Warning signs:** None currently — this is a "confirm it still holds" pitfall, not an active bug.

## Code Examples

### Full migration file draft for `slide_pipeline_runs` + `latest_slide_runs`

Synthesized from the `scan_history` table pattern (schema.sql), the `conversions` table pattern (per-record status/error/metadata), and the Phase 26 success criteria (per-stage translate/render/deploy status + duration + error, overall status, queryable "latest per deck"):

```sql
-- Source: synthesized from scripts/db/schema.sql scan_history + conversions table patterns
-- Migration 009: slide_pipeline_runs ledger + latest_slide_runs view
-- One row per pipeline invocation for one deck. Per-stage columns support
-- translate (Phase 25), render (Phase 24), and deploy (Phase 28) independently,
-- so this table doesn't need another migration bolted on when those phases land.

CREATE TABLE IF NOT EXISTS slide_pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_path TEXT NOT NULL,              -- e.g. docs/slides/internal/2026-05-21-figma-ai-internal-deck.md
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'watcher', 'dispatch', 'rest', 'mcp')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  overall_status TEXT NOT NULL DEFAULT 'running'
    CHECK (overall_status IN ('running', 'success', 'failed', 'partial')),

  translate_status TEXT CHECK (translate_status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  translate_duration_ms INTEGER,
  translate_error TEXT,

  render_status TEXT CHECK (render_status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  render_duration_ms INTEGER,
  render_error TEXT,

  deploy_status TEXT CHECK (deploy_status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  deploy_duration_ms INTEGER,
  deploy_error TEXT,

  duration_ms INTEGER,                  -- total wall-clock, mirrors scan_history.duration_ms
  metadata TEXT                         -- JSON: free-form (e.g. content hash, output file list)
);

CREATE INDEX IF NOT EXISTS idx_slide_runs_deck ON slide_pipeline_runs(deck_path);
CREATE INDEX IF NOT EXISTS idx_slide_runs_started ON slide_pipeline_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_slide_runs_status ON slide_pipeline_runs(overall_status);

CREATE VIEW IF NOT EXISTS latest_slide_runs AS
SELECT * FROM (
  SELECT
    r.*,
    ROW_NUMBER() OVER (PARTITION BY r.deck_path ORDER BY r.started_at DESC) AS rn
  FROM slide_pipeline_runs r
)
WHERE rn = 1;
```

**Note for the planner:** This is a draft to react to, not a locked design — column names/CHECK values should be reconciled against however Phase 26 (Ledger Wiring) ends up calling stages in code. The important structural decisions this research resolves are: (a) versioned migration file, not inline `server.mjs` table; (b) per-stage columns exist from Phase 23 even though only PIPE-04/Phase 26 writes to them; (c) `latest_slide_runs` uses `ROW_NUMBER()` partitioned by `deck_path`, verified compatible with both the app's SQLite (3.53.0) and the CLI's SQLite (3.43.2).

### Verifying the migration via sqlite3 CLI (matches success criterion 3's exact wording)

```bash
# Source: derived from scripts/db/migrate.mjs behavior + repo's existing sqlite3 CLI availability
npm run db:migrate
sqlite3 data/documind.db ".schema slide_pipeline_runs"
sqlite3 data/documind.db ".schema latest_slide_runs"
sqlite3 data/documind.db "SELECT version FROM schema_migrations ORDER BY version;"
```

### Verifying `.dockerignore` / no baked secrets (success criterion 4)

```bash
# Source: standard Docker introspection, applied to this repo's existing Dockerfile/.dockerignore
docker build -t documind:phase23-check .
docker history --no-trunc documind:phase23-check | grep -i env    # should show no .env content
docker run --rm documind:phase23-check sh -c 'test -f .env && echo FOUND || echo ABSENT'   # expect ABSENT
```

## State of the Art

Not applicable — this phase uses only patterns already established in this repository as of 2026-07-10 (no external library version currency concerns). All "state of the art" here is intra-repo consistency, not ecosystem tracking.

## Open Questions

1. **Should `config/env.mjs` export the six new pipeline vars in Phase 23, or wait for the phases that consume them?**
   - What we know: FOUND-02's success criterion only names `.env.example` documentation. `SOFFICE_PATH` is consumed by Phase 24, `DEEPL_API_KEY` by Phase 25, `FTP_*` by Phase 28.
   - What's unclear: Whether the planner wants `config/env.mjs` touched now (single-source-of-truth-from-day-one) or deferred to each consuming phase (smaller, more focused diffs per phase).
   - Recommendation: Lean toward wiring the exports now — it's a ~15-line addition to an already-open file, keeps CLAUDE.md's env var table and `.env.example` in sync with actual code in the same commit, and avoids Phase 24/25/28 each needing to touch `config/env.mjs` for a var that was already documented two phases earlier. Not a hard requirement either way; flag for planner discretion.

2. **Exact `git rm --cached` invocation style — explicit file list vs. glob.**
   - What we know: Exactly 6 files need untracking (listed in Pitfall 1). The repo is on branch `fix/2026-07-07-table-lint-rules` per git status context, not yet on a `v3.4`/Phase-23-specific branch.
   - What's unclear: Whether the plan should shell out `git rm --cached path/to/each/file` individually (safest, matches the CLAUDE.md Git Safety Protocol's "avoid `git add -A`"-style caution against overly broad commands) or use a glob per subdirectory.
   - Recommendation: Use explicit per-file `git rm --cached` invocations (6 files, known exact paths from `git ls-files` above) rather than a glob — avoids any risk of accidentally sweeping in a future-added tracked file under `docs/slides/` that shouldn't be untracked.

3. **Which branch does Phase 23 work land on?**
   - What we know: Current git branch is `fix/2026-07-07-table-lint-rules` (unrelated prior work, per git status header). Per the user's global Branching Protocol, this phase touches config files (`.gitignore`, `.dockerignore`, `.env.example`) and is the first phase of a new milestone — a fresh branch (e.g. `feat/2026-07-10-v3.4-foundation-hygiene` or similar, per the `feat/` prefix guide) is warranted before editing.
   - What's unclear: Not a research question — this is a planning/execution-time decision, flagging here only so the planner doesn't inherit the current unrelated branch by default.
   - Recommendation: Planner/executor should branch off `master` (not off `fix/2026-07-07-table-lint-rules`) before starting Phase 23 work, per the global Branching Protocol's "config files" and "roadmap phase" triggers.

## Sources

### Primary (HIGH confidence)

- Direct repo inspection (`Read`/`Bash` on this checkout, 2026-07-10): `.gitignore`, `.dockerignore`, `.env.example`, `Dockerfile`, `config/env.mjs`, `scripts/db/schema.sql`, `scripts/db/migrate.mjs`, `scripts/db/migrations/001-008-*.sql`, `daemon/server.mjs` (grep for `CREATE TABLE`/`action_log`), `package.json`, live `data/documind.db` via `sqlite3` CLI (`.tables`, `SELECT version FROM schema_migrations`)
- `git ls-files` / `git log --oneline -- docs/slides` / `du -sh` on the actual tracked slide export files — exact file list and sizes confirmed, not assumed
- `node -e "... sqlite_version()"` against the project's actual `better-sqlite3` install (3.53.0) and `which sqlite3 && sqlite3 --version` (3.43.2) — both confirmed to support window functions

### Secondary (MEDIUM confidence)

- None used — no WebSearch was needed; this phase's entire scope is answerable from the repository's own existing conventions.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new libraries; verified exact versions of both SQLite drivers in use in this repo
- Architecture: HIGH — every pattern recommended is copied from an existing, working file in this repo, not inferred
- Pitfalls: HIGH — each pitfall is grounded in a specific, verified repo state (e.g. migration 008's untracked status was confirmed by querying the live DB, not assumed)

**Research date:** 2026-07-10
**Valid until:** No external-library expiry risk (repo-internal patterns only) — but re-verify the "next migration number" (currently `009`) and the exact `git ls-files` slide export list if other work lands on `docs/slides/` or `scripts/db/migrations/` before this phase is planned/executed.
