# Phase 11: Foundation - Research

**Researched:** 2026-03-23
**Domain:** Node.js environment configuration, codebase path externalization
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- `.env` file at project root, gitignored
- `.env.example` shipped with documented defaults (current macOS paths)
- Audit and refactor: daemon/, processors/, config/, scripts/ (production code paths)
- Also update: CLAUDE.md (agents read it, must reflect env var config)
- Leave alone: docs/, .planning/, other markdown documentation
- Repo list: both auto-discover from DOCUMIND_REPOS_DIR (scan for .git dirs) AND explicit list override via env var/config for CI with specific repos
- Both-layers approach: auto-detect macOS paths as fallback when no .env exists, .env overrides when present
- Local dev must continue working without any setup after refactor
- In Docker, env vars are required (no macOS fallback)

### Claude's Discretion

- Env var prefix strategy (DOCUMIND_ vs mix of standard + prefixed)
- Cron schedule configurability (per-tier expressions vs enable/disable)
- Whether context profiles (config/profiles/*.json) coexist with env vars or get simplified
- Centralized constants file vs per-module config pattern
- MCP server config approach (same pattern as daemon or separate)
- PM2 retention for local dev vs dropping to node direct
- Breaking change tolerance (zero-setup vs one-time cp .env.example .env)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FNDTN-01 | All hardcoded macOS paths replaced with configurable env vars | Audit complete — 3 production files + config/constants.mjs contain paths; centralized env loading pattern identified |
| FNDTN-02 | Repository paths resolved from DOCUMIND_REPOS_DIR env var | Auto-discover pattern via fs.readdir + .git detection identified; explicit override via DOCUMIND_REPOS env var |
| FNDTN-03 | Port, DB path, and cron schedules configurable via env vars | PORT and DOCUMIND_DB already env-var-driven; cron schedules hardcoded in scheduler.mjs — externalization approach documented |
| FNDTN-04 | .env file with documented defaults for local development | Node 22 has process.loadEnvFile() built-in; no third-party dependency needed; .gitignore already excludes *.db and data/ but not .env — must add |
</phase_requirements>

---

## Summary

Phase 11 is a surgical refactor — the daemon and processor infrastructure already has partial env var support (PORT, DOCUMIND_DB, DOCUMIND_PROFILE are all env-var-driven), but several production files bypass that system with inline hardcoded paths. The full audit reveals exactly **three production source files** with hardcoded `/Users/Shared` paths: `processors/tree-processor.mjs`, `daemon/server.mjs` (one fallback line), and `config/constants.mjs` (the root cause — everything else derives `LOCAL_BASE_PATH` from it). Legacy scripts in `scripts/` also contain hardcoded paths but those are lower-priority maintenance scripts, not daemon code.

The context profile system (`context/loader.mjs` + `config/profiles/dvwdesign.json`) already handles repository resolution correctly — it reads an external registry file at a relative path, computes absolute paths, and passes them down as `ctx.repoRoots`. The missing piece is: the profile/registry files themselves contain hardcoded absolute paths (`/Users/Shared/htdocs/github/DVWDesign`). The fix is to make `DOCUMIND_REPOS_DIR` override the base path at profile-load time, or to introduce a new `config/env.mjs` shim that is loaded once at startup and re-exports all env vars with defaults.

For `.env` loading, Node 22's built-in `process.loadEnvFile()` (available since 20.12.0) is the right tool — no dotenv dependency needed. The daemon startup file (`daemon/server.mjs`) calls it once before anything else runs. The `--env-file` CLI flag is an alternative but requires touching the pm2 and npm scripts.

**Primary recommendation:** Create `config/env.mjs` as the single source of truth for all runtime config, loaded via `process.loadEnvFile()` at the top of server.mjs and mcp-server.mjs. All other modules import from `config/env.mjs` rather than reading `process.env` directly.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `process.loadEnvFile()` | Node 20.12+ / 22.x | Load `.env` file into process.env | Zero dependency, already available on Node 22 |
| Node.js `fs.readdir` | built-in | Auto-discover repos by scanning parent dir for `.git` | No extra deps |
| `path.resolve` | built-in | Normalize all paths from env vars | Handles relative paths safely |

### No New Dependencies Required

All tooling for this phase is already present in the codebase or built into Node 22. No `npm install` needed.

**Note on dotenv:** The project does NOT currently use dotenv. Node 22's `process.loadEnvFile()` is the correct replacement — it reads a `.env` file and merges into `process.env`, respecting already-set vars (so Docker/PM2 env vars always win over `.env` file values). Confirmed: `typeof process.loadEnvFile === 'function'` on this machine.

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```text
DocuMind/
├── config/
│   ├── env.mjs              # NEW: single source of truth for runtime config
│   ├── constants.mjs        # REFACTOR: LOCAL_BASE_PATH reads from env
│   └── profiles/
│       └── dvwdesign.json   # REFACTOR: repositoryRegistryPath stays relative
├── .env                     # NEW: gitignored, local values
├── .env.example             # NEW: committed, documents all vars with defaults
└── daemon/
    └── server.mjs           # ADD: process.loadEnvFile() before all imports
```

### Pattern 1: Centralized Env Module (config/env.mjs)

**What:** One module that calls `process.loadEnvFile()` and exports all env-derived config constants as named exports.

**When to use:** Any module that needs runtime config imports from here, never reads `process.env` directly.

**Why:** Single load point, type-safe defaults, easy to test, no scattered `process.env.X || default` across the codebase.

```javascript
// config/env.mjs
// Source: Node.js docs — process.loadEnvFile() (Node 20.12+)
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env if it exists — silently skip if missing (zero-setup dev)
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // .env is optional; Docker/PM2 pass vars directly
}

export const PORT = Number(process.env.PORT ?? 9000);
export const DB_PATH = process.env.DOCUMIND_DB ?? path.join(ROOT, 'data/documind.db');
export const PROFILE_PATH = process.env.DOCUMIND_PROFILE ?? path.join(ROOT, 'config/profiles/dvwdesign.json');
export const REPOS_DIR = process.env.DOCUMIND_REPOS_DIR ?? null;  // null = auto-discover
export const REPOS_LIST = process.env.DOCUMIND_REPOS
  ? process.env.DOCUMIND_REPOS.split(',').map(s => s.trim())
  : null;  // null = use profile/registry

// Cron schedules (override per schedule tier)
export const CRON_HEARTBEAT   = process.env.DOCUMIND_CRON_HEARTBEAT   ?? '*/15 * * * *';
export const CRON_HOURLY      = process.env.DOCUMIND_CRON_HOURLY      ?? '0 * * * *';
export const CRON_DAILY       = process.env.DOCUMIND_CRON_DAILY       ?? '0 2 * * *';
export const CRON_WEEKLY      = process.env.DOCUMIND_CRON_WEEKLY      ?? '0 3 * * 0';
export const CRON_RELINK      = process.env.DOCUMIND_CRON_RELINK      ?? '0 */6 * * *';
```

### Pattern 2: DOCUMIND_REPOS_DIR + Auto-Discovery

**What:** If `DOCUMIND_REPOS_DIR` is set, scan that directory for subdirectories containing `.git/` and build the repo list dynamically. If `DOCUMIND_REPOS` (comma-separated names) is also set, filter to only those names.

**When to use:** Both local dev (fallback to `commonDir` of existing profile paths) and Docker mode (required).

```javascript
// context/loader.mjs — augmented buildCtx()
import { REPOS_DIR, REPOS_LIST } from '../config/env.mjs';

async function buildCtx(validated, profileFilePath) {
  let repoRoots;

  if (REPOS_DIR) {
    // DOCUMIND_REPOS_DIR mode: auto-discover or use explicit list
    const base = REPOS_DIR;
    if (REPOS_LIST) {
      // Explicit override — used for CI
      repoRoots = REPOS_LIST.map(name => ({ name, path: path.join(base, name) }));
    } else {
      // Auto-discover: scan REPOS_DIR for subdirs with .git/
      const entries = await fs.readdir(base, { withFileTypes: true });
      const discovered = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const gitDir = path.join(base, entry.name, '.git');
        try {
          await fs.access(gitDir);
          discovered.push({ name: entry.name, path: path.join(base, entry.name) });
        } catch { /* no .git, skip */ }
      }
      repoRoots = discovered;
    }
  } else if (validated.repositories) {
    repoRoots = validated.repositories
      .filter(r => r.active !== false)
      .map(r => ({ name: r.name, path: r.path }));
  } else {
    // Registry-based path (existing behavior)
    // ... existing registry loading code ...
  }
  // ... rest of buildCtx unchanged
}
```

### Pattern 3: constants.mjs Reads from Env

**What:** `LOCAL_BASE_PATH` in `config/constants.mjs` is derived from `DOCUMIND_REPOS_DIR` when set, falling back to the macOS path for local dev continuity.

```javascript
// config/constants.mjs (top of file)
import { REPOS_DIR } from './env.mjs';

export const LOCAL_BASE_PATH = REPOS_DIR ?? '/Users/Shared/htdocs/github/DVWDesign';
```

This one-line change propagates through all 20+ constants that derive paths from `LOCAL_BASE_PATH`.

### Pattern 4: process.loadEnvFile() Call Position

**What:** Call `process.loadEnvFile()` as early as possible in the process lifecycle — before any other imports that might read `process.env`.

**Constraint:** In ES modules, `import` statements are hoisted. This means `process.loadEnvFile()` must either be in `config/env.mjs` (which all other modules import), OR use a dynamic `await import()` pattern at the top of server.mjs.

**Correct approach:** Put the `loadEnvFile()` call at the top of `config/env.mjs`. Because all config-reading code imports from `config/env.mjs`, the env file is loaded before any config values are consumed.

### Anti-Patterns to Avoid

- **Inline `process.env.X || default` across files:** This is the current scattered pattern in daemon/server.mjs and daemon/mcp-server.mjs. Move all env reads to `config/env.mjs`.
- **Calling `process.loadEnvFile()` in multiple entry points:** Only call it once in `config/env.mjs`. Multiple calls are harmless but redundant and confusing.
- **Parsing DOCUMIND_REPOS_DIR at module evaluation time in non-env modules:** Ensure path resolution happens in `config/env.mjs`, not in tree-processor.mjs or other processors directly.
- **Hardcoding the fallback macOS path in multiple places:** The `LOCAL_BASE_PATH` fallback must exist in exactly one place — `config/constants.mjs` (or `config/env.mjs`). Every other file imports from there.

---

## Hardcoded Path Audit

Complete inventory of files requiring changes:

### Production Code (in-scope per CONTEXT.md)

| File | Line | Current Value | Fix |
|------|------|---------------|-----|
| `config/constants.mjs` | 42 | `'/Users/Shared/htdocs/github/DVWDesign'` | Read from `REPOS_DIR` env, fallback to current value |
| `processors/tree-processor.mjs` | 12 | `const REPOS_ROOT = '/Users/Shared/htdocs/github/DVWDesign'` | Import `REPOS_DIR` from `config/env.mjs` |
| `daemon/server.mjs` | 50 | Fallback `|| '/Users/Shared/htdocs/github/DVWDesign'` | Replace with `REPOS_DIR` from env |
| `config/profiles/dvwdesign.json` | (uses `repositoryRegistryPath`) | Points to RootDispatcher at `../../../RootDispatcher/config/...` | Relative path — this works as-is; the registry itself contains absolute paths |

### Registry File (path-bearing, read at runtime)

| File | Issue | Fix |
|------|-------|-----|
| `config/repo-schema.json` | Line 5: `"/Users/Shared/htdocs/github/DVWDesign/DocuMind"` | This is a JSON schema example/template, not runtime code — verify if it's used at runtime |

### Scripts (in-scope per CONTEXT.md decisions)

| File | Issue | Fix |
|------|-------|-----|
| `scripts/scan-all-repos.mjs` | `BASE_PATH` hardcoded | Import `LOCAL_BASE_PATH` from `config/constants.mjs` |
| `scripts/fix-markdown.mjs` | `basePath` hardcoded | Import `LOCAL_BASE_PATH` |
| `scripts/fix-custom-errors.mjs` | `basePath` hardcoded | Import `LOCAL_BASE_PATH` |
| `scripts/watch-and-index.mjs` | `BASE_PATH` hardcoded | Import `LOCAL_BASE_PATH` |
| `scripts/propagate-lint-rules.mjs` | `BASE_PATH` hardcoded | Import `LOCAL_BASE_PATH` |
| `scripts/propagate-org-fixes.mjs` | `BASE_PATH` hardcoded | Import `LOCAL_BASE_PATH` |
| `scripts/fix-github-org-references.mjs` | `BASE_PATH` hardcoded | Import `LOCAL_BASE_PATH` |
| `scripts/scan/enhanced-scanner.mjs` | 8 hardcoded repo paths | Build from `LOCAL_BASE_PATH` + repo names |

### CLAUDE.md (in-scope per CONTEXT.md)

| Location | Current | Fix |
|----------|---------|-----|
| Line 30: Absolute path note | `/Users/Shared/htdocs/github/DVWDesign/DocuMind/` | Document as `$DOCUMIND_REPOS_DIR/DocuMind/` (or note it's machine-specific) |
| Line 490: Memory file path | `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/repos/DocuMind.md` | Document with env var context |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .env file loading | Custom file parser | `process.loadEnvFile()` (Node 20.12+) | Built-in, handles quoting/escaping, respects already-set vars |
| .git directory detection | Recursive walk | `fs.access(path.join(dir, '.git'))` inside a shallow `fs.readdir` | Simple, fast, no deps |
| env var type coercion | Ad-hoc string parsing | Explicit coercions in `config/env.mjs` (Number(), split(',')) | Centralized, testable |
| Optional .env (no error if missing) | try/catch around `loadEnvFile` | Exactly a try/catch — Node throws ENOENT if file missing | That's the correct pattern |

**Key insight:** The entire `config/env.mjs` module is 30-40 lines. Any "config library" (dotenv, env-var, convict, etc.) adds dependency weight for no benefit when Node 22 handles it natively.

---

## Common Pitfalls

### Pitfall 1: ES Module Import Hoisting Defeats Early .env Load

**What goes wrong:** Developer puts `process.loadEnvFile('.env')` at the top of `server.mjs`, then imports a module that reads `process.env.SOME_VAR` at module evaluation time. The import runs before `loadEnvFile()` because `import` is hoisted.

**Why it happens:** ESM static imports are always resolved before the module body runs.

**How to avoid:** All `process.env` reads must happen inside `config/env.mjs`. Since `config/env.mjs` calls `loadEnvFile()` at its own module evaluation time, all downstream imports of `config/env.mjs` see the loaded values.

**Warning signs:** Env var reads that return `undefined` even though `.env` is present.

### Pitfall 2: REPOS_DIR with Trailing Slash

**What goes wrong:** `path.join('/some/path/', 'repo')` works fine, but `path.resolve('/some/path/')` vs `path.resolve('/some/path')` can differ in string comparisons.

**How to avoid:** Always normalize in `config/env.mjs`: `path.resolve(process.env.DOCUMIND_REPOS_DIR.replace(/\/$/, ''))`.

### Pitfall 3: constants.mjs Circular Import

**What goes wrong:** `config/env.mjs` imports from `config/constants.mjs`, and `config/constants.mjs` imports from `config/env.mjs` — circular dependency.

**How to avoid:** `config/env.mjs` must not import from `config/constants.mjs`. Keep it pure: only reads `process.env` and re-exports values. `constants.mjs` then imports from `env.mjs`.

### Pitfall 4: tree-processor.mjs Uses REPOS_ROOT for Individual Repo Paths

**What goes wrong:** `tree-processor.mjs` uses `path.join(REPOS_ROOT, repoName)` to construct per-repo paths. After refactor, if `REPOS_ROOT` changes but the `repoName` values don't match the actual subdirectory names on the new system, paths break.

**How to avoid:** After refactoring `tree-processor.mjs` to read `DOCUMIND_REPOS_DIR`, verify that `analyzeRepo()` callers pass names that match actual directory names under `REPOS_DIR`.

### Pitfall 5: .env Not Gitignored

**What goes wrong:** `.env` file with local macOS paths gets committed and shipped with the image.

**Current state:** The `.gitignore` does NOT currently exclude `.env` files. Must add `.env` to `.gitignore` as part of this phase.

**How to avoid:** Add `.env` to `.gitignore`. The `.env.example` (with documented defaults) is what gets committed.

### Pitfall 6: PM2 Ecosystem Config Has Relative DOCUMIND_DB

**Current state:** `ecosystem.config.cjs` passes `DOCUMIND_DB: './data/documind.db'` — a relative path. This resolves relative to the PM2 process working directory, which may differ from `ROOT`. The daemon already handles this correctly by resolving against `ROOT`. No change needed, but must verify the `.env` example uses an absolute or ROOT-relative format.

---

## Code Examples

### .env.example (complete)

```text
# DocuMind Runtime Configuration
# Copy this file to .env for local development
# In Docker, pass these as environment variables

# ─── Server ──────────────────────────────────────────────────────────────────
PORT=9000

# ─── Database ────────────────────────────────────────────────────────────────
# Absolute path or relative to project root
DOCUMIND_DB=./data/documind.db

# ─── Profile ─────────────────────────────────────────────────────────────────
# Path to context profile JSON
DOCUMIND_PROFILE=./config/profiles/dvwdesign.json

# ─── Repository Root ─────────────────────────────────────────────────────────
# Parent directory containing all repositories to scan
# Local macOS default (set this for your machine):
DOCUMIND_REPOS_DIR=/Users/Shared/htdocs/github/DVWDesign
# Docker example:
# DOCUMIND_REPOS_DIR=/repos

# ─── Explicit Repo List (optional — overrides auto-discovery) ─────────────────
# Comma-separated repo names under DOCUMIND_REPOS_DIR
# Leave unset to auto-discover all directories with .git
# DOCUMIND_REPOS=DocuMind,RootDispatcher,GlossiaApp

# ─── Cron Schedules ──────────────────────────────────────────────────────────
# Leave unset to use defaults
# DOCUMIND_CRON_HEARTBEAT=*/15 * * * *
# DOCUMIND_CRON_HOURLY=0 * * * *
# DOCUMIND_CRON_DAILY=0 2 * * *
# DOCUMIND_CRON_WEEKLY=0 3 * * 0
# DOCUMIND_CRON_RELINK=0 */6 * * *
```

### config/env.mjs (complete)

```javascript
// Source: Node.js docs — process.loadEnvFile() available since Node 20.12.0
// Node 22 is confirmed on this machine; Node >=20.0.0 per package.json engines
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// Load .env — try/catch so missing file is not an error (Docker passes vars directly)
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // .env is optional
}

export const PORT = Number(process.env.PORT ?? 9000);

export const DB_PATH = path.resolve(
  ROOT,
  process.env.DOCUMIND_DB ?? 'data/documind.db'
);

export const PROFILE_PATH = path.resolve(
  ROOT,
  process.env.DOCUMIND_PROFILE ?? 'config/profiles/dvwdesign.json'
);

// Primary: explicit env var. Null = use profile/registry for repo resolution.
export const REPOS_DIR = process.env.DOCUMIND_REPOS_DIR
  ? path.resolve(process.env.DOCUMIND_REPOS_DIR)
  : null;

// Optional: comma-separated repo names (CI override)
export const REPOS_LIST = process.env.DOCUMIND_REPOS
  ? process.env.DOCUMIND_REPOS.split(',').map(s => s.trim()).filter(Boolean)
  : null;

// Cron schedule expressions
export const CRON_HEARTBEAT = process.env.DOCUMIND_CRON_HEARTBEAT ?? '*/15 * * * *';
export const CRON_HOURLY    = process.env.DOCUMIND_CRON_HOURLY    ?? '0 * * * *';
export const CRON_DAILY     = process.env.DOCUMIND_CRON_DAILY     ?? '0 2 * * *';
export const CRON_WEEKLY    = process.env.DOCUMIND_CRON_WEEKLY    ?? '0 3 * * 0';
export const CRON_RELINK    = process.env.DOCUMIND_CRON_RELINK    ?? '0 */6 * * *';
```

### Auto-discovery in context/loader.mjs

```javascript
// Source: Node.js fs/promises docs
import fs from 'fs/promises';
import path from 'path';
import { REPOS_DIR, REPOS_LIST } from '../config/env.mjs';

async function discoverRepos(base) {
  const entries = await fs.readdir(base, { withFileTypes: true });
  const repos = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(base, entry.name, '.git'));
      repos.push({ name: entry.name, path: path.join(base, entry.name) });
    } catch {
      // no .git directory, skip
    }
  }
  return repos;
}

// Inside buildCtx(), before existing registry logic:
if (REPOS_DIR) {
  const discovered = await discoverRepos(REPOS_DIR);
  return REPOS_LIST
    ? discovered.filter(r => REPOS_LIST.includes(r.name))
    : discovered;
}
// ... existing registry/inline logic follows
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| dotenv npm package | `process.loadEnvFile()` built-in | Node 20.12 (2024) | Zero dependency env loading |
| `--env-file` CLI flag only | `process.loadEnvFile()` programmatic API | Node 20.12 | Can be called anywhere in code |
| Hardcode all paths | Centralized `config/env.mjs` shim | This phase | One edit point per env var |

**Deprecated/outdated:**

- `dotenv` package: still works, but unnecessary on Node 22. This project has no dotenv dependency currently — keep it that way.
- `--env-file` CLI flag: works but requires changing npm scripts and PM2 config; programmatic loading in `config/env.mjs` is less intrusive.

---

## Open Questions

1. **repo-schema.json runtime usage**
   - What we know: `config/repo-schema.json` contains an absolute path at line 5
   - What's unclear: Is it used at runtime or is it a static JSON Schema for validation only?
   - Recommendation: Grep for `repo-schema.json` imports before treating as in-scope

2. **PM2 retention**
   - What we know: `ecosystem.config.cjs` currently passes env vars directly; user left this at Claude's discretion
   - What's unclear: Whether PM2 should pick up the `.env` file automatically or continue relying on `ecosystem.config.cjs` env block
   - Recommendation: Keep PM2 as-is. The `.env` file is loaded programmatically by `config/env.mjs` at startup — PM2 does not need special config. Document this in `.env.example`.

3. **CLAUDE.md absolute path references**
   - What we know: Two lines in CLAUDE.md contain `/Users/Shared` paths
   - What's unclear: Whether to remove them entirely or replace with env var notation
   - Recommendation: Keep the paths as examples but note they are machine-specific defaults. Add a note that `DOCUMIND_REPOS_DIR` overrides the base.

---

## Sources

### Primary (HIGH confidence)

- Node.js 22 docs — `process.loadEnvFile()` — verified locally (`typeof process.loadEnvFile === 'function'`)
- Direct codebase audit — all occurrences of `/Users/Shared` in daemon/, processors/, config/, scripts/ confirmed via grep
- `config/constants.mjs` — verified as the root constant; all script `BASE_PATH` values are duplicates of this

### Secondary (MEDIUM confidence)

- Node.js 20.6 release notes — `--env-file` flag introduction; 20.12 added programmatic `process.loadEnvFile()`
- Existing `context/loader.mjs` — already has `DOCUMIND_PROFILE` env var pattern; extending same convention to `DOCUMIND_REPOS_DIR`

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies; Node 22 built-ins confirmed
- Architecture: HIGH — direct code audit; all hardcoded paths inventoried
- Pitfalls: HIGH — ESM hoisting issue is a known Node.js gotcha, directly verified

**Research date:** 2026-03-23
**Valid until:** 2026-06-23 (stable Node.js APIs)
