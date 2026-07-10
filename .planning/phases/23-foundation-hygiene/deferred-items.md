# Deferred Items — Phase 23 Foundation & Hygiene

Items discovered during plan execution that are out of scope for the current task (pre-existing, unrelated to the task's file changes) per the executor's scope-boundary rule. Not auto-fixed; logged here for future triage.

## 23-02: Missing package-lock.json blocks Docker image build

**Found during:** 23-02 Task 3 (Docker secret-hygiene verification)

**Issue:** No `package-lock.json` exists anywhere in the repository. `docker build` fails at the `RUN npm ci` step in the builder stage with `npm error code EUSAGE — The npm ci command can only install with an existing package-lock.json`. This is a pre-existing repository state, unrelated to any Phase 23-02 change (`.env.example`, `config/env.mjs`, `CLAUDE.md`).

**Impact:** The Docker image cannot currently be built at all (not specific to this plan), so the image-level secret checks in 23-02 Task 3 (`docker run ... test -f .env`, `docker history | grep secret-patterns`) could not be executed. Static checks (`.dockerignore` excludes `.env`; Dockerfile's defense-in-depth `RUN rm -f ... .env` line) both passed.

**Not fixed because:** Generating a `package-lock.json` and validating the resulting native-module build (better-sqlite3) is a build/tooling change outside this plan's declared file scope (`.env.example`, `config/env.mjs`, `CLAUDE.md`) and carries its own risk (lockfile drift, dependency resolution changes) — Rule 4 territory (architectural/tooling change), not a Rule 1-3 auto-fix.

**Recommendation:** A future phase or a dedicated fix task should run `npm install` to generate `package-lock.json`, commit it, and re-verify the Docker build end-to-end (including the FOUND-02 secret-hygiene checks) before any phase that depends on a working Docker image (e.g., deploy-related phases).
