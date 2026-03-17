# Phase 2: Context Profile Loader - Research

**Researched:** 2026-03-16
**Domain:** Configuration externalization — Zod-validated JSON profile loader, env var switching, hardcoded constant migration
**Confidence:** HIGH

---

## Summary

Phase 2 moves all DVWDesign-specific configuration out of hardcoded `.mjs` files and into a single validated JSON profile that DocuMind loads at startup. Three separate locations in the codebase contain hardcoded config that must migrate: `processors/keyword-processor.mjs` (TECH_KEYWORDS, ACTION_KEYWORDS sets), `scripts/db/backfill/backfill-classifications.mjs` (CLASSIFICATION_RULES array), and `config/constants.mjs` (repository paths, already partially superseded by `repository-registry.json`). A fourth location, `daemon/watcher.mjs`, has `REPOS_ROOT` hardcoded as a string literal.

The profile is a JSON file on disk. At daemon startup, `context/loader.mjs` reads the file path from `DOCUMIND_PROFILE` env var (defaulting to `config/profiles/dvwdesign.json`), validates it with a Zod schema, and exports a frozen `ctx` object. Every subsystem that currently reads from hardcoded constants instead imports `ctx`. A missing or invalid profile must crash the process immediately with a descriptive error — not silently start in a bad state.

The existing `repository-registry.json` (owned by RootDispatcher) already defines repo paths and is already consumed by `daemon/server.mjs` and `daemon/watcher.mjs`. The profile must either reference this file by path or absorb the repo list. The simplest approach that keeps RootDispatcher as the canonical source is to store the registry file path in the profile, not the repo list itself — then `ctx.repoRoots` is derived by reading the registry at load time.

**Primary recommendation:** Create `context/loader.mjs` as a pure module (no side effects, no DB access) that exports a single `loadProfile(profilePath?)` async function returning a validated, frozen `ctx` object. Call it once at daemon startup before Express or the DB is initialized. All hardcoded constants become `ctx.classificationRules`, `ctx.keywordTaxonomy.technology`, etc.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROF-01 | Context profile JSON schema validated by Zod at startup | Zod already in package.json at `^3.22.4`; needs bump to `^3.25.0` for MCP SDK compatibility (Phase 4), but validation works at current version. Schema covers: repositories/registryPath, classificationRules, keywordTaxonomy, lintRules, relationshipTypes. |
| PROF-02 | `context/loader.mjs` loads active profile and exposes `ctx` object (repo paths, classification tree, relationship types, keyword taxonomies, lint rules) | Pure async module pattern; `DOCUMIND_PROFILE` env var → file path → `fs.readFile` → `JSON.parse` → Zod validate → freeze → export. No external libraries needed beyond Zod. |
| PROF-03 | `dvwdesign.json` reference profile that reproduces current hardcoded behavior | All three hardcoded sources mapped (see Code Examples section). Profile shape defined in Architecture Patterns. |
| PROF-04 | Classification tree defined in profile, not in database schema | `CLASSIFICATION_RULES` array in `backfill-classifications.mjs` moves to `profile.classificationRules[]`. The array shape (pattern as string + classification as materialized path) is already the right unit — just needs to be in JSON. |
| PROF-05 | Keyword taxonomies defined in profile, not hardcoded in processor | `TECH_KEYWORDS` and `ACTION_KEYWORDS` Sets in `keyword-processor.mjs` move to `profile.keywordTaxonomy.technology[]` and `profile.keywordTaxonomy.action[]`. `STOP_WORDS` stays hardcoded — it is language-universal, not DVWDesign-specific. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| `zod` | `^3.22.4` (current), `^3.25.0` (target) | Profile JSON schema validation | Already in package.json. Crash-on-invalid behavior is native to `schema.parse()` which throws `ZodError`. Standard for Node.js config validation. |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| Node.js `fs/promises` | built-in | Read profile JSON from disk | All profile file I/O. No external library needed. |
| Node.js `process.env` | built-in | Read `DOCUMIND_PROFILE` env var | Profile path resolution at startup. |
| `Object.freeze()` | built-in | Prevent runtime mutation of `ctx` | Applied after validation so consumers cannot accidentally mutate shared config. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Zod schema validation | JSON Schema + `ajv` | Zod already present; AJV adds a new dependency; Zod provides better TypeScript-style error messages |
| File-based profile only | DB-stored profile (`context_profiles` table, as sketched in STACK.md) | File-based is simpler and works without the daemon DB running; DB storage is a Phase 3+ concern for profile switching via API |
| Plain `JSON.parse` + manual checks | Zod | Manual checks do not produce structured errors; Zod gives field-level messages useful for the crash log |

**Installation:** No new packages needed. Zod is already installed. No version bump required for Phase 2 (version bump to `^3.25.0` is a Phase 4 prerequisite).

---

## Architecture Patterns

### Recommended Project Structure (Additions for Phase 2)

```text
DocuMind/
├── context/
│   ├── loader.mjs          # NEW — loadProfile(), validates and returns ctx
│   └── schema.mjs          # NEW — Zod schema for profile JSON (exported separately for testability)
├── config/
│   ├── profiles/
│   │   └── dvwdesign.json  # NEW — reference profile (PROF-03)
│   └── constants.mjs       # EXISTING — keep for now; ctx replaces its consumers
├── daemon/
│   ├── server.mjs          # MODIFY — call loadProfile() at top, pass ctx down
│   └── watcher.mjs         # MODIFY — remove hardcoded REPOS_ROOT; use ctx.repoRoots
├── processors/
│   └── keyword-processor.mjs   # MODIFY — remove TECH_KEYWORDS/ACTION_KEYWORDS; accept ctx param
└── scripts/db/backfill/
    └── backfill-classifications.mjs  # MODIFY — remove CLASSIFICATION_RULES; accept ctx param
```

### Pattern 1: Startup-time Validation with Process Crash

**What:** `loadProfile()` is called before any Express routes, DB initialization, or watcher startup. If it throws (invalid JSON, schema failure, missing file), the process exits with a non-zero code and a readable error.

**When to use:** Any config that, if wrong, would silently produce bad output (wrong repos scanned, wrong classifications stored). A bad profile must be visible immediately.

```javascript
// context/loader.mjs
import fs from 'fs/promises';
import path from 'path';
import { profileSchema } from './schema.mjs';

const DEFAULT_PROFILE = path.resolve(process.cwd(), 'config/profiles/dvwdesign.json');

export async function loadProfile(profilePath) {
  const filePath = profilePath || process.env.DOCUMIND_PROFILE || DEFAULT_PROFILE;

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    throw new Error(
      `[DocuMind] Cannot load context profile from "${filePath}": ${err.message}\n` +
      `Set DOCUMIND_PROFILE env var to a valid profile JSON path.`
    );
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[DocuMind] Profile at "${filePath}" is not valid JSON: ${err.message}`);
  }

  // Throws ZodError with field-level messages if invalid
  const validated = profileSchema.parse(json);

  return Object.freeze(buildCtx(validated, filePath));
}
```

```javascript
// daemon/server.mjs — top of file, before Express init
import { loadProfile } from '../context/loader.mjs';

let ctx;
try {
  ctx = await loadProfile();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Now pass ctx to initWatcher(db, ROOT, ctx), initScheduler(db, ctx), etc.
```

### Pattern 2: Zod Schema with Detailed Field Descriptions

**What:** The Zod schema validates every field and provides error messages that tell the user exactly which field is wrong.

```javascript
// context/schema.mjs
import { z } from 'zod';

const classificationRuleSchema = z.object({
  pattern: z.string().describe('Regex pattern string (tested against document path)'),
  classification: z.string().describe('Materialized path, e.g. "engineering/api-docs"'),
});

const keywordTaxonomySchema = z.object({
  technology: z.array(z.string()).describe('Technology keyword list'),
  action: z.array(z.string()).describe('Action keyword list'),
});

const repositorySchema = z.object({
  name: z.string(),
  path: z.string().describe('Path relative to basePath, or absolute'),
  active: z.boolean().default(true),
});

export const profileSchema = z.object({
  id: z.string().describe('Profile slug, e.g. "dvwdesign-internal"'),
  name: z.string(),
  version: z.string(),
  // Option A: inline repo list
  repositories: z.array(repositorySchema).optional(),
  // Option B: reference external registry file
  repositoryRegistryPath: z.string().optional(),
  classificationRules: z.array(classificationRuleSchema),
  keywordTaxonomy: keywordTaxonomySchema,
  relationshipTypes: z.array(z.string()),
  lintRules: z.object({
    profile: z.enum(['strict', 'standard', 'relaxed']).default('standard'),
    customPatternsPath: z.string().optional(),
  }).optional(),
}).refine(
  data => data.repositories || data.repositoryRegistryPath,
  { message: 'Profile must define either "repositories" or "repositoryRegistryPath"' }
);
```

### Pattern 3: Consumer Modules Accept ctx Parameter

**What:** Rather than importing `ctx` globally, functions that need profile data accept a `ctx` argument. This keeps modules testable (pass a mock ctx) and avoids circular imports.

**When to use:** For all processors and subsystems that need classification rules or keyword taxonomies.

```javascript
// processors/keyword-processor.mjs — AFTER refactor
export function extractKeywords(content, ctx, topN = 15) {
  const techSet = new Set(ctx.keywordTaxonomy.technology);
  const actionSet = new Set(ctx.keywordTaxonomy.action);
  // ... rest of logic unchanged
}

export function indexKeywords(db, documentId, content, ctx) {
  const keywords = extractKeywords(content, ctx);
  // ... db writes unchanged
}
```

```javascript
// scripts/db/backfill/backfill-classifications.mjs — AFTER refactor
export function backfillClassifications(db, ctx) {
  // Build compiled patterns from ctx.classificationRules
  const compiledRules = ctx.classificationRules.map(r => ({
    pattern: new RegExp(r.pattern),
    classification: r.classification,
  }));
  // ... rest of logic uses compiledRules instead of CLASSIFICATION_RULES
}
```

### Pattern 4: Repository Registry Bridge

**What:** The existing `RootDispatcher/config/repository-registry.json` is already the canonical source of truth for repo paths. The profile references it by path rather than duplicating the repo list.

**When to use:** When the profile's `repositoryRegistryPath` field is set instead of `repositories`.

```javascript
// In buildCtx() within context/loader.mjs
async function buildCtx(validated, profilePath) {
  let repoRoots;

  if (validated.repositories) {
    repoRoots = validated.repositories
      .filter(r => r.active !== false)
      .map(r => ({ name: r.name, path: r.path }));
  } else {
    // Read external registry
    const registryPath = path.isAbsolute(validated.repositoryRegistryPath)
      ? validated.repositoryRegistryPath
      : path.resolve(path.dirname(profilePath), validated.repositoryRegistryPath);
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf-8'));
    repoRoots = registry.repositories
      .filter(r => r.active !== false)
      .map(r => ({ name: r.name, path: path.join(registry.basePath, r.path) }));
  }

  return {
    profileId: validated.id,
    repoRoots,
    classificationRules: validated.classificationRules.map(r => ({
      pattern: new RegExp(r.pattern),
      classification: r.classification,
    })),
    keywordTaxonomy: validated.keywordTaxonomy,
    relationshipTypes: validated.relationshipTypes,
    lintRules: validated.lintRules ?? { profile: 'standard' },
  };
}
```

### Anti-Patterns to Avoid

- **Global singleton import of ctx:** Do NOT do `import { ctx } from '../context/loader.mjs'` as a top-level module side effect. Module-level side effects in ESM run once and cannot be reset for testing. Pass `ctx` as a function parameter instead.
- **Re-reading the profile file on every request:** Read and validate once at startup, cache in memory. Profile reloads require a daemon restart (by design — profile changes are not live-reloaded).
- **Storing profile in the DB at this phase:** DB-stored profiles are a Phase 3+ concern (needed for API-driven profile switching). For Phase 2, file-only is correct and sufficient.
- **Absorbing repository-registry.json into the profile:** RootDispatcher owns the repo list. The profile should reference the registry file path, not duplicate 14 repo entries. Duplication creates drift.
- **Recompiling regex patterns on every document:** Compile `classificationRules[].pattern` strings into `RegExp` objects once in `buildCtx()`, not on every `classifyPath()` call.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Schema validation with useful error messages | Custom type-check function | Zod `schema.parse()` | ZodError includes path to failing field, expected type, received value — all needed for crash log |
| Env var fallback chain | Custom env resolution | `process.env.DOCUMIND_PROFILE \|\| DEFAULT_PROFILE` | Simple ternary; no library needed at this scale |
| Profile freezing / immutability | Deep clone on every read | `Object.freeze(ctx)` | Shallow freeze prevents accidental mutation of the `ctx` object; deep freeze of nested arrays is not needed since processors only read, not write |

**Key insight:** The profile loader is intentionally thin. Its only job is read-validate-freeze. Complexity belongs in the schema definition and the subsystems that consume `ctx`, not in the loader itself.

---

## Common Pitfalls

### Pitfall 1: Regex Patterns Are Stored as Strings in JSON

**What goes wrong:** `classificationRules[].pattern` is a regex in JS but JSON cannot store `RegExp` objects. Storing `/\/docs\/api\//` as a string in JSON drops the `/` delimiters, causing `new RegExp(r.pattern)` to match incorrectly or throw.

**Why it happens:** Developers copy the JS regex literal (including `/` delimiters) into the JSON string value.

**How to avoid:** Store the regex body without delimiters: `"pattern": "\\/docs\\/api\\/"` (note the double-escaped backslashes because JSON strings need `\\` to produce a single `\`). In `buildCtx()`, compile with `new RegExp(r.pattern)` — no flags needed for path matching.

**Warning signs:** Classification tests pass in JS but fail when loaded from the profile JSON.

### Pitfall 2: `process.exit(1)` Before Express Starts Gives No Visible Error in PM2

**What goes wrong:** PM2 catches the exit, restarts the process, which exits again. PM2 sees it as a crash loop. The error message in `console.error` scrolls past unless the developer is actively tailing logs.

**Why it happens:** PM2 default `max_restarts` is 15 — it keeps retrying silently for a while.

**How to avoid:** After `console.error(err.message)`, write a structured error to a known file (e.g., `data/startup-error.json`) before calling `process.exit(1)`. Or set `max_restarts: 0` in `ecosystem.config.cjs` for profile validation failures — but this is complex. The simpler fix is to ensure the error message is clear enough that PM2 logs tell the story.

**Warning signs:** PM2 shows `errored` status; `pm2 logs documind` shows a repeated pattern.

### Pitfall 3: Consumers Capture References Before Profile Is Loaded

**What goes wrong:** A module imports keyword-processor at the top of server.mjs, which immediately creates `new Set(TECH_KEYWORDS)` at module evaluation time — before `loadProfile()` has been called.

**Why it happens:** ES module top-level code runs at import time, not when the function is called. If keyword-processor creates Sets at module scope, it cannot later use `ctx` values.

**How to avoid:** After the refactor, keyword-processor must NOT create any Sets at module scope. The Sets are created inside `extractKeywords(content, ctx, ...)` using `ctx.keywordTaxonomy.technology`. Module scope should contain only imports and function definitions.

**Warning signs:** `extractKeywords` uses old hardcoded keywords even after profile is loaded.

### Pitfall 4: `Object.freeze()` Is Shallow

**What goes wrong:** `ctx.classificationRules.push(...)` throws (Array is frozen), but `ctx.classificationRules[0].pattern = 'x'` silently succeeds (inner objects are not frozen).

**Why it happens:** `Object.freeze()` only freezes the top-level object — nested objects and arrays remain mutable.

**How to avoid:** For Phase 2, shallow freeze is sufficient because the regex patterns inside each rule are compiled from strings and stored as `RegExp` objects — processors only call `.test()` on them, never mutate them. If deep immutability is needed later, use a recursive freeze utility. Do not over-engineer now.

### Pitfall 5: `DOCUMIND_PROFILE` Env Var Not Propagated to PM2

**What goes wrong:** Developer sets `DOCUMIND_PROFILE=/path/to/profile.json` in shell, starts daemon with PM2 — but PM2 does not inherit the shell environment. The daemon loads the default profile.

**Why it happens:** PM2 has its own process environment. Shell env vars are not automatically inherited.

**How to avoid:** Document that `DOCUMIND_PROFILE` must be set in `ecosystem.config.cjs` under `env` if using PM2:

```javascript
// ecosystem.config.cjs
env: {
  DOCUMIND_PROFILE: process.env.DOCUMIND_PROFILE || './config/profiles/dvwdesign.json'
}
```

---

## Code Examples

### Complete dvwdesign.json Reference Profile

```json
{
  "id": "dvwdesign-internal",
  "name": "DVWDesign Internal",
  "version": "1.0.0",
  "repositoryRegistryPath": "../../RootDispatcher/config/repository-registry.json",
  "classificationRules": [
    { "pattern": "\\/docs\\/api\\/", "classification": "engineering/api-docs" },
    { "pattern": "CLAUDE\\.md$", "classification": "engineering/architecture" },
    { "pattern": "\\/.planning\\/", "classification": "engineering/architecture" },
    { "pattern": "ADR[-_]", "classification": "engineering/architecture/adrs" },
    { "pattern": "README\\.md$", "classification": "references/readme" },
    { "pattern": "CHANGELOG", "classification": "operations/changelog" },
    { "pattern": "\\/scripts\\/", "classification": "engineering/scripts" },
    { "pattern": "\\/config\\/", "classification": "engineering/config" },
    { "pattern": "\\/tests?\\/", "classification": "engineering/tests" },
    { "pattern": "\\/docs\\/", "classification": "guides/documentation" },
    { "pattern": "\\.github\\/", "classification": "operations/ci-cd" },
    { "pattern": "package\\.json$", "classification": "engineering/config" }
  ],
  "keywordTaxonomy": {
    "technology": [
      "react", "vue", "angular", "svelte", "next", "nuxt", "vite", "webpack",
      "typescript", "javascript", "node", "express", "fastify", "koa",
      "mongodb", "mongoose", "postgresql", "supabase", "redis", "sqlite",
      "tailwind", "shadcn", "radix", "mui", "storybook", "figma",
      "docker", "pm2", "nginx", "vercel", "cloudflare",
      "pnpm", "npm", "yarn", "changesets", "tsup", "esbuild",
      "jest", "vitest", "cypress", "playwright",
      "api", "rest", "graphql", "websocket", "mcp",
      "auth", "oauth", "jwt", "pdf", "markdown", "mermaid", "figjam"
    ],
    "action": [
      "deploy", "build", "test", "install", "configure", "setup",
      "migrate", "upgrade", "fix", "debug", "monitor", "scan",
      "create", "delete", "update", "publish", "release"
    ]
  },
  "relationshipTypes": [
    "imports", "parent_of", "variant_of", "supersedes",
    "depends_on", "related_to", "generated_from", "dispatched_to"
  ],
  "lintRules": {
    "profile": "strict",
    "customPatternsPath": "config/custom-error-patterns.json"
  }
}
```

### Files That Need Modification (Inventory)

| File | What Changes | Hardcoded Values Removed |
| ---- | ------------ | ------------------------ |
| `processors/keyword-processor.mjs` | `TECH_KEYWORDS` and `ACTION_KEYWORDS` Sets removed from module scope; `extractKeywords` and `indexKeywords` accept `ctx` parameter | `TECH_KEYWORDS` Set (68 items), `ACTION_KEYWORDS` Set (17 items) |
| `scripts/db/backfill/backfill-classifications.mjs` | `CLASSIFICATION_RULES` array removed; `backfillClassifications` accepts `ctx` parameter | `CLASSIFICATION_RULES` array (12 rules) |
| `daemon/watcher.mjs` | `REPOS_ROOT` string literal removed; watcher patterns built from `ctx.repoRoots` | `'/Users/Shared/htdocs/github/DVWDesign'` |
| `daemon/server.mjs` | `loadProfile()` call added at top; `ctx` threaded to `initWatcher()` and `initScheduler()` | None (server already reads registry externally) |
| `graph/relations.mjs` | `buildRelationships()` accepts `ctx` for relationship type validation | Hardcoded type strings `'imports'`, `'dispatched_to'`, `'supersedes'`, `'related_to'` — these can remain as string literals since they match `ctx.relationshipTypes`; or validate against `ctx.relationshipTypes` for strictness |
| `config/constants.mjs` | No change for Phase 2 (it is not imported by daemon or processors); keep for CLI scripts | N/A |

### Startup Integration Pattern (server.mjs)

```javascript
// daemon/server.mjs — top of file
import { loadProfile } from '../context/loader.mjs';

// Must run before Express init, DB init, watcher init
let ctx;
try {
  ctx = await loadProfile();
  console.error(`[DocuMind] Loaded profile: ${ctx.profileId}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const PORT = process.env.PORT || 9000;
const DB_PATH = process.env.DOCUMIND_DB || path.join(ROOT, 'data/documind.db');

// Derive REPOS_ROOT from ctx instead of reading registry again
const REPOS_ROOT = ctx.repoRoots[0]?.path
  ? path.dirname(path.dirname(ctx.repoRoots[0].path))
  : '/Users/Shared/htdocs/github/DVWDesign'; // last-resort fallback

// ... rest of server initialization
initWatcher(db, ROOT, ctx);
initScheduler(db, ctx);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Hardcoded constants in module scope | Startup-loaded validated JSON profile | Phase 2 | Portability to non-DVWDesign deployments; test isolation |
| Repository paths in `config/constants.mjs` | `repository-registry.json` (already in place) + profile reference | Existing (v2.0) | Already solved; Phase 2 just wires `ctx.repoRoots` from the registry |
| `TECH_KEYWORDS` Set hardcoded in processor | `ctx.keywordTaxonomy.technology` array from profile | Phase 2 | Keyword vocabulary tunable per deployment without code change |
| `CLASSIFICATION_RULES` array in backfill script | `ctx.classificationRules` from profile | Phase 2 | Classification behavior changes by swapping profile, not editing code |

---

## Open Questions

1. **Should `STOP_WORDS` move to the profile?**
   - What we know: `STOP_WORDS` in `keyword-processor.mjs` are language-universal English stop words (the, a, and, etc.) — not DVWDesign-specific
   - What's unclear: Whether a future French/German deployment would need different stop words
   - Recommendation: Keep `STOP_WORDS` hardcoded for Phase 2. The requirement says "keyword taxonomies defined in profile" — stop words are not a taxonomy. Revisit if Phase 3 surfaces a need.

2. **Does `config/constants.mjs` get deleted?**
   - What we know: `constants.mjs` is not imported by any daemon or processor file (only by CLI scripts and possibly scan scripts). Its data partially overlaps with `repository-registry.json`.
   - What's unclear: Whether any CLI scripts rely on it at Phase 2 scope
   - Recommendation: Do not delete `constants.mjs` in Phase 2. Scan for consumers and plan removal in Phase 3 cleanup.

3. **Should the profile Zod schema be strict (no extra keys) or passthrough?**
   - What we know: `z.object().strict()` rejects any key not in the schema. Passthrough silently ignores extra keys.
   - What's unclear: Whether future phases will add profile fields that must be forward-compatible
   - Recommendation: Use `.strict()` for Phase 2. Forces profile authors to be intentional. Fields can be added to the schema when needed.

4. **Does `graph/relations.mjs` need to validate relationship types against `ctx.relationshipTypes`?**
   - What we know: Currently `buildRelationships()` uses literal strings like `'imports'`, `'dispatched_to'`. The profile defines the allowed set.
   - What's unclear: Whether using a type outside the profile should be an error or just a warning
   - Recommendation: Pass `ctx` to `buildRelationships()` but do not validate for Phase 2 — the relationship type strings are inference-detected from content patterns, not user-provided. Add validation in Phase 3 when the orchestrator is wired.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` (key absent — treat as false). Skipping this section.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `processors/keyword-processor.mjs`, `scripts/db/backfill/backfill-classifications.mjs`, `config/constants.mjs`, `daemon/watcher.mjs`, `daemon/server.mjs`, `graph/relations.mjs` — all read directly to identify hardcoded values
- `.planning/REQUIREMENTS.md` — PROF-01 through PROF-05 requirements read directly
- `.planning/research/STACK.md` — Context profile JSON schema pattern and Zod usage documented (researched 2026-03-15)
- `RootDispatcher/config/repository-registry.json` — Existing registry structure confirmed (basePath + repositories array)

### Secondary (MEDIUM confidence)

- `.planning/research/FEATURES.md` — Feature dependency chain: context profile gates portability (researched 2026-03-15)
- `.planning/phases/01-schema-migration-foundation/01-CONTEXT.md` — Decision: "Classification tree shape lives in the context profile, not hardcoded in schema"
- `.planning/STATE.md` — Decision log confirms: "Context profile schema must be designed generically (not DVW-shaped) to enable Step #3 portability"

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — Zod already in project; file I/O is Node.js built-ins; no new libraries
- Architecture: HIGH — loader pattern derived directly from codebase inspection; all hardcoded values catalogued
- Pitfalls: HIGH — regex-in-JSON and PM2 env var issues are well-known; module scope timing issue observed in existing code

**Research date:** 2026-03-16
**Valid until:** 2026-06-16 (stable domain — no fast-moving libraries involved)
