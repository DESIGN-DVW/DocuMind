---

phase: 13-git-clone-ingestion-dual-mode
plan: "02"
subsystem: infra
tags: [docker, dockerfile, docker-compose, git, clone-mode, mount-mode, ingestion, env-config]
dependency_graph:
  requires:

    - phase: 13-01

      provides: dual-mode-ingestion-module

    - phase: 12-02

      provides: dockerfile-and-docker-compose-baseline
  provides:

    - docker-infrastructure-for-dual-mode-ingestion

  affects: [docker-compose.yml, Dockerfile, .env.example]
tech_stack:
  added: []
  patterns: [runtime-secret-injection, commented-opt-in-config, named-volume-for-clone-mode]
key_files:
  created: []
  modified:

    - Dockerfile

    - docker-compose.yml

    - .env.example

key_decisions:

  - "git installed in runtime stage only — builder stage still omits it to keep build layer small"

  - "/app/repos created and owned by documind user before USER directive so it is writable at runtime"

  - "REPO_MODE defaults to mount via ${REPO_MODE:-mount} — zero behavior change for existing deployments"

  - "Clone mode vars (GIT_TOKEN, DOCUMIND_REPOS) shipped as YAML comments — user uncomments to activate"

  - "REPOS_HOST_PATH variable makes the bind mount path configurable without editing docker-compose.yml"

  - "documind_repos named volume defined as comment for easy clone mode opt-in"

patterns_established:

  - "Runtime secrets: passed via env interpolation at docker compose up time, never ARG/ENV in Dockerfile"

  - "Opt-in config: clone mode shipped as commented YAML blocks — default is always mount mode"

requirements_completed:

  - INGEST-01

  - INGEST-04

  - INGEST-05

duration: 2min
completed: "2026-03-26"

---

# Phase 13 Plan 02: Docker Infrastructure Dual-Mode Ingestion Summary

Docker infrastructure updated to support both mount and clone ingestion modes via `REPO_MODE` env var — git installed in runtime image, `/app/repos` created for clone mode storage, docker-compose restructured with commented opt-in clone mode blocks.

## Performance

- **Duration:** ~2 min

- **Started:** 2026-03-26T23:33:00Z

- **Completed:** 2026-03-26T23:35:00Z

- **Tasks:** 2

- **Files modified:** 3

## Accomplishments

- `git` added to Dockerfile runtime stage so clone mode can execute git commands inside the container

- `/app/repos` directory created and owned by `documind` user for clone mode to write into

- `docker-compose.yml` restructured with `REPO_MODE` defaulting to `mount`, bind mount configurable via `REPOS_HOST_PATH`, and clone mode blocks shipped as opt-in comments

- `.env.example` extended with `REPO_MODE`, `GIT_TOKEN`, `DOCUMIND_REPOS`, and `REPOS_HOST_PATH` documentation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add git to Dockerfile runtime stage and create /app/repos** - `710acd6` (feat)

2. **Task 2: Restructure docker-compose.yml for dual mode and update .env.example** - `25173fd` (feat)

## Files Created/Modified

- `Dockerfile` — Added `git` to runtime `apt-get install`; added `/app/repos` owned by `documind`

- `docker-compose.yml` — Added `REPO_MODE`, `REPOS_HOST_PATH` bind mount, clone mode comments, `documind_repos` named volume as comment

- `.env.example` — Added Ingestion Mode section documenting `REPO_MODE`, `GIT_TOKEN`, `DOCUMIND_REPOS`, `REPOS_HOST_PATH`

## Decisions Made

### git in runtime stage only

The builder stage already installs Python/make/g++ for native module compilation. Adding `git` to the runtime stage only keeps the concern isolated — the runtime image is the one that needs to execute `git clone` and `git pull` at container runtime.

### /app/repos ownership

`mkdir -p /app/repos && chown documind:documind /app/repos` is added before the `USER documind` directive. This is required because `chown` needs root to run. At runtime, the `documind` user can write cloned repos into this directory.

### Clone mode as commented YAML blocks

Clone mode configuration (`GIT_TOKEN`, `DOCUMIND_REPOS`, `documind_repos` volume) is shipped as commented YAML. This makes mount mode the safe default — existing deployments work unchanged. Users activating clone mode uncomment the relevant lines rather than replacing values.

### REPOS_HOST_PATH variable

The bind mount left-hand side is `${REPOS_HOST_PATH:-/Users/Shared/htdocs/github/DVWDesign}`. This allows CI/CD environments or remote servers to set their own repo root without editing `docker-compose.yml`. The fallback preserves the macOS dev path from Phase 12.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Docker changes take effect on next `docker compose build && docker compose up`.

## Next Phase Readiness

- Docker infrastructure is complete for both ingestion modes

- To activate clone mode: set `REPO_MODE=clone` + `GIT_TOKEN` + `DOCUMIND_REPOS` in host env, uncomment clone mode lines in docker-compose.yml, then run `docker compose up --build`

- Mount mode continues to work identically to Phase 12 output with no changes required

---

### Phase: 13-git-clone-ingestion-dual-mode

### Completed: 2026-03-26
