---
phase: 13-git-clone-ingestion-dual-mode
verified: 2026-03-27T00:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
---

# Phase 13: Git Clone Ingestion Dual Mode — Verification Report

**Phase Goal:** The container can ingest repositories either by scanning mounted directories (volume mode) or by cloning/pulling them at runtime (clone mode), selected via a single env var
**Verified:** 2026-03-27
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                        | Status     | Evidence                                                                                                                    |
| -- | ------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1  | REPO_MODE=mount causes daemon to skip clone logic and return immediately                                     | ✓ VERIFIED | `ingestion.mjs` L50-53: `if (REPO_MODE === 'mount') { console.log(...); return; }`                                         |
| 2  | REPO_MODE=clone causes daemon to clone repos listed in DOCUMIND_REPOS into /app/repos on startup            | ✓ VERIFIED | `ingestion.mjs` L55-118: full clone loop with `execFileAsync('git', ['clone', '--depth=1', ...])`                          |
| 3  | Invalid REPO_MODE value causes process.exit(1) with clear error message                                     | ✓ VERIFIED | `ingestion.mjs` L55-60: `if (REPO_MODE !== 'clone') { console.error(...); process.exit(1); }`                              |
| 4  | Clone mode with missing GIT_TOKEN or empty DOCUMIND_REPOS exits with clear error                            | ✓ VERIFIED | `ingestion.mjs` L63-78: two separate guards — one for REPOS_LIST, one for GIT_TOKEN, each calling process.exit(1)          |
| 5  | Already-cloned repos (detected by .git presence) are skipped on startup                                     | ✓ VERIFIED | `ingestion.mjs` L91-101: `fs.access(gitDir)` check; on success logs "already cloned" and continues                        |
| 6  | Periodic git pull runs on CRON_HOURLY when REPO_MODE=clone, triggering incremental scan for changed repos   | ✓ VERIFIED | `scheduler.mjs` L192-210: `if (REPO_MODE === 'clone') { cron.schedule(CRON_HOURLY, ...) }` with re-scan per updated repo  |
| 7  | docker-compose.yml supports REPO_MODE=mount with configurable host bind mount                               | ✓ VERIFIED | `docker-compose.yml` L17: `REPO_MODE: "${REPO_MODE:-mount}"`, L10: bind mount via `${REPOS_HOST_PATH:-...}:/repos:ro`     |
| 8  | docker-compose.yml supports REPO_MODE=clone with GIT_TOKEN and DOCUMIND_REPOS passed from host env         | ✓ VERIFIED | `docker-compose.yml` L23-24: `# DOCUMIND_REPOS: "${DOCUMIND_REPOS}"` and `# GIT_TOKEN: "${GIT_TOKEN}"` as opt-in comments |
| 9  | GIT_TOKEN is NOT visible in docker history output (not baked into image)                                    | ✓ VERIFIED | `Dockerfile`: zero occurrences of `GIT_TOKEN`, `ARG GIT`, or `ENV GIT` — confirmed by grep returning no output            |
| 10 | git is available in the runtime Docker image                                                                 | ✓ VERIFIED | `Dockerfile` L27: `apt-get install -y dumb-init curl git`                                                                  |
| 11 | /app/repos directory exists and is writable by the documind user in the container                           | ✓ VERIFIED | `Dockerfile` L36: `RUN mkdir -p /app/repos && chown documind:documind /app/repos` — before `USER documind` directive      |
| 12 | .env.example documents REPO_MODE, GIT_TOKEN, and DOCUMIND_REPOS                                             | ✓ VERIFIED | `.env.example` L75-93: INGESTION MODE section with all three vars plus REPOS_HOST_PATH                                     |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact                | Expected                                                    | Status      | Details                                                                              |
| ----------------------- | ----------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `daemon/ingestion.mjs`  | Exports `initIngestion` and `pullAllRepos`                  | ✓ VERIFIED  | 182 lines; both functions fully implemented and exported                             |
| `config/env.mjs`        | Exports `REPO_MODE` defaulting to `'mount'`                 | ✓ VERIFIED  | L105: `export const REPO_MODE = process.env.REPO_MODE ?? 'mount';`                  |
| `daemon/server.mjs`     | Calls `initIngestion()` before `loadProfile()`              | ✓ VERIFIED  | L34: `await initIngestion();` — L39: `ctx = await loadProfile();` — correct order   |
| `daemon/scheduler.mjs`  | Conditional pull cron when REPO_MODE=clone                  | ✓ VERIFIED  | L192-210: conditional block imports and calls `pullAllRepos()`                       |
| `Dockerfile`            | Runtime stage includes git and creates /app/repos           | ✓ VERIFIED  | L27: git in apt-get; L36: /app/repos created and owned by documind                  |
| `docker-compose.yml`    | Dual-mode configuration with REPO_MODE                      | ✓ VERIFIED  | REPO_MODE defaults to mount; clone vars shipped as opt-in comments                  |
| `.env.example`          | Documents REPO_MODE, GIT_TOKEN, DOCUMIND_REPOS              | ✓ VERIFIED  | INGESTION MODE section at end of file, clone mode vars commented for safety         |

---

## Key Link Verification

| From                   | To                       | Via                                             | Status     | Details                                                               |
| ---------------------- | ------------------------ | ----------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `daemon/server.mjs`    | `daemon/ingestion.mjs`   | `await initIngestion()` before `loadProfile()`  | ✓ WIRED    | L25 import, L34 call — call appears 5 lines before `loadProfile()`   |
| `daemon/scheduler.mjs` | `daemon/ingestion.mjs`   | `pullAllRepos()` in CRON_HOURLY cron job         | ✓ WIRED    | L10 import, L196 call — inside conditional `REPO_MODE === 'clone'`   |
| `daemon/ingestion.mjs` | `config/env.mjs`         | `import { REPO_MODE, REPOS_LIST }`               | ✓ WIRED    | L29: `import { REPO_MODE, REPOS_LIST } from '../config/env.mjs';`    |
| `docker-compose.yml`   | `daemon/ingestion.mjs`   | `REPO_MODE`, `GIT_TOKEN`, `DOCUMIND_REPOS` vars  | ✓ WIRED    | L17: REPO_MODE set; GIT_TOKEN passed via env interpolation at runtime |
| `Dockerfile`           | `daemon/ingestion.mjs`   | `/app/repos` directory + git binary              | ✓ WIRED    | L27: git installed; L36: /app/repos created with documind ownership   |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                              | Status      | Evidence                                                                                    |
| ----------- | ----------- | -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| INGEST-01   | 13-01, 13-02 | Volume mount mode scans mounted repo directories        | ✓ SATISFIED | mount mode is the default (REPO_MODE defaults to 'mount'); initIngestion() is a no-op; docker-compose bind mount works via REPOS_HOST_PATH |
| INGEST-02   | 13-01       | Git-clone mode clones configured repos on container start | ✓ SATISFIED | initIngestion() full clone loop in ingestion.mjs L85-118; idempotent .git check; --depth=1 clone |
| INGEST-03   | 13-01       | Git-clone mode pulls repos on cron schedule              | ✓ SATISFIED | pullAllRepos() in ingestion.mjs L133-181; scheduler.mjs L192-210 registers pull cron conditionally |
| INGEST-04   | 13-01, 13-02 | REPO_MODE env var switches between mount and clone modes | ✓ SATISFIED | config/env.mjs L105 exports REPO_MODE; ingestion.mjs, scheduler.mjs, docker-compose.yml all branch on it |
| INGEST-05   | 13-02       | Git credentials accepted via env vars (not baked into image) | ✓ SATISFIED | GIT_TOKEN read from process.env at runtime in ingestion.mjs L71; absent from Dockerfile entirely |

**REQUIREMENTS.md coverage:** All 5 INGEST IDs map to Phase 13 in the requirements tracker. No orphaned requirements found.

---

## Anti-Patterns Found

| File                  | Line | Pattern | Severity | Impact                                                                                  |
| --------------------- | ---- | ------- | -------- | --------------------------------------------------------------------------------------- |
| `daemon/server.mjs`   | 252  | TODO    | Info     | Pre-existing TODO in `/convert` endpoint (not created in Phase 13; unrelated to goal)  |

No blockers. No warnings. The single TODO is pre-existing and outside Phase 13 scope.

---

## Human Verification Required

The following behaviors require a running container to fully confirm:

### 1. Clone Mode End-to-End Flow

**Test:** Set `REPO_MODE=clone`, `GIT_TOKEN=<valid token>`, `DOCUMIND_REPOS=DVWDesign/DocuMind`, then run `docker compose up --build`
**Expected:** Container logs show `[ingestion] Cloning DVWDesign/DocuMind...` followed by `[ingestion] Ready — 1 cloned, 0 already present`. On second restart, logs show `[ingestion] skip DocuMind — already cloned`.
**Why human:** Requires a valid GitHub token and a live network connection; cannot simulate in a static code check.

### 2. Invalid REPO_MODE Exit Behavior

**Test:** Set `REPO_MODE=badvalue` and start the daemon
**Expected:** Process exits with non-zero code and log line: `[ingestion] ERROR: Invalid REPO_MODE="badvalue". Must be "mount" or "clone".`
**Why human:** Requires actually launching the process with a tampered env var.

### 3. Mount Mode Backward Compatibility

**Test:** Run `docker compose up` with no `REPO_MODE` set (or `REPO_MODE=mount`) and a valid `REPOS_HOST_PATH` bind mount
**Expected:** Daemon starts normally, no clone activity in logs, repos are scanned from bind-mounted path as in Phase 12 baseline.
**Why human:** Requires running Docker and confirming zero behavioral change from Phase 12 output.

---

## Gaps Summary

None. All 12 observable truths verified. All 5 artifacts are substantive and wired. All 5 INGEST requirements satisfied. No blocker anti-patterns. Phase goal is achieved.

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
