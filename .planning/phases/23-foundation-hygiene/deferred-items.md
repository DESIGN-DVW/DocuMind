# Deferred Items — Phase 23 Foundation & Hygiene

## npm audit: 7 remaining moderates — assessed, deferred 2026-07-11

After the pnpm→npm migration, `npm audit` reported 10 moderates. Fixed: `markdown-it` DoS (GHSA-6v5v-wf23-fmfq) via markdownlint-cli2 0.22→0.23 bump (custom DVW001/DVW002 rules verified working). Deferred as not exploitable in this codebase:

- **uuid via node-cron (2)** — advisory requires calling `uuid.v3/v5/v6` with a `buf` argument; node-cron only calls `uuid.v4()` with no args. Real fix is node-cron 3→4 (breaking, runtime dep of daemon/scheduler.mjs) — do as a deliberate upgrade with daemon testing, not via `npm audit fix --force`.
- ~~pug/pug-code-gen/vue-template-compiler/vue-docgen-api/better-docs (5)~~ **RESOLVED 2026-07-11**: `better-docs` removed entirely — the template was already `docdash`; better-docs only supplied two unused plugins (typescript, component — repo has no TS sources or components). JSDoc regenerated successfully without them (output refreshed, picked up previously undocumented modules). Audit now reports only the 2 deferred node-cron/uuid moderates.

Items discovered during plan execution that are out of scope for the current task (pre-existing, unrelated to the task's file changes) per the executor's scope-boundary rule. Not auto-fixed; logged here for future triage.

## 23-02: Missing package-lock.json blocks Docker image build — ✓ RESOLVED 2026-07-11

**Resolution:** Root cause was two-fold: (1) `.gitignore` line 3 explicitly ignored `package-lock.json` (pnpm-era rule — repo also carries `pnpm-lock.yaml` and a pnpm symlink store in the local `node_modules`); (2) `npm install --package-lock-only` crashed in-place (`Cannot read properties of null (reading 'matches')`) because npm's arborist chokes on the pnpm `.pnpm` symlink store. Lockfile was generated in a clean directory from `package.json` + `.npmrc` (873 packages, lockfileVersion 3, `npm ci --dry-run` validated), the ignore rule removed, and the lockfile committed (`e92c4cc`). `docker build` now succeeds end-to-end; image-layer secret checks completed and passed (no `.env` in image, no secret-shaped strings in layer history, no env vars baked into image config). Remaining pnpm remnants (`pnpm-lock.yaml` tracked in git, `"pnpm"` section in package.json, pnpm-contaminated local `node_modules`) logged for user triage.

## Original entry (2026-07-10)

**Found during:** 23-02 Task 3 (Docker secret-hygiene verification)

**Issue:** No `package-lock.json` exists anywhere in the repository. `docker build` fails at the `RUN npm ci` step in the builder stage with `npm error code EUSAGE — The npm ci command can only install with an existing package-lock.json`. This is a pre-existing repository state, unrelated to any Phase 23-02 change (`.env.example`, `config/env.mjs`, `CLAUDE.md`).

**Impact:** The Docker image cannot currently be built at all (not specific to this plan), so the image-level secret checks in 23-02 Task 3 (`docker run ... test -f .env`, `docker history | grep secret-patterns`) could not be executed. Static checks (`.dockerignore` excludes `.env`; Dockerfile's defense-in-depth `RUN rm -f ... .env` line) both passed.

**Not fixed because:** Generating a `package-lock.json` and validating the resulting native-module build (better-sqlite3) is a build/tooling change outside this plan's declared file scope (`.env.example`, `config/env.mjs`, `CLAUDE.md`) and carries its own risk (lockfile drift, dependency resolution changes) — Rule 4 territory (architectural/tooling change), not a Rule 1-3 auto-fix.

**Recommendation:** A future phase or a dedicated fix task should run `npm install` to generate `package-lock.json`, commit it, and re-verify the Docker build end-to-end (including the FOUND-02 secret-hygiene checks) before any phase that depends on a working Docker image (e.g., deploy-related phases).
