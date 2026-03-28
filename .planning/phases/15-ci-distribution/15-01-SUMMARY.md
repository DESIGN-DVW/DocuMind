---
phase: 15-ci-distribution
plan: "01"
subsystem: infra
tags: [github-actions, docker, ghcr, buildx, qemu, multi-arch, semver]

requires:
  - phase: 12-dockerfile-docker-compose
    provides: Two-stage Dockerfile with builder/runtime separation that CI workflow builds

provides:
  - Tag-triggered GitHub Actions workflow publishing multi-arch image to GHCR on v*.*.* push
  - Dockerfile builder stage pinned to BUILDPLATFORM to avoid QEMU-emulated native module compilation

affects:
  - release-process
  - docker-distribution

tech-stack:
  added:
    - docker/setup-qemu-action@v4
    - docker/setup-buildx-action@v5
    - docker/login-action@v4
    - docker/metadata-action@v6
    - docker/build-push-action@v7
  patterns:
    - BUILDPLATFORM ARG before first FROM enables native-platform builder stage in multi-arch builds
    - metadata-action with flavor latest=auto + type=semver produces version and latest tags automatically
    - GHA cache (type=gha) reuses Docker layers across workflow runs

key-files:
  created:
    - .github/workflows/publish.yml
  modified:
    - Dockerfile

key-decisions:
  - "Builder stage pinned to ${BUILDPLATFORM:-linux/amd64} so npm ci compiles better-sqlite3 natively on GitHub runner, not under QEMU"
  - "timeout-minutes: 60 on workflow job to accommodate ARM64 better-sqlite3 compilation under QEMU (5-20x slower)"
  - "GITHUB_TOKEN used for GHCR auth with packages: write permission — no PAT rotation burden"
  - "metadata-action flavor: latest=auto handles both version and latest tags from a single semver push"

patterns-established:
  - "Pattern 1: ARG BUILDPLATFORM before FROM in builder stage is required for any Dockerfile with native Node.js modules in multi-arch builds"
  - "Pattern 2: docker/metadata-action outputs tags and labels used directly by build-push-action — no manual tag string construction"

requirements-completed:
  - CICD-02
  - CICD-03
  - CICD-04

duration: 1min
completed: 2026-03-28
---

# Phase 15 Plan 01: CI & Distribution Summary

**Tag-triggered GitHub Actions workflow builds linux/amd64 + linux/arm64 Docker image and pushes to GHCR with semver and latest tags; Dockerfile builder stage pinned to BUILDPLATFORM to avoid QEMU-emulated native module compilation.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-28T22:59:25Z
- **Completed:** 2026-03-28T23:00:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Dockerfile builder stage updated with `ARG BUILDPLATFORM` + `FROM --platform=${BUILDPLATFORM:-linux/amd64}` — native `npm ci` on GitHub-hosted amd64 runners; plain `docker build` still works via `:-linux/amd64` default
- `.github/workflows/publish.yml` created with complete 6-step Docker action suite: checkout, qemu v4, buildx v5, login v4, metadata v6, build-push v7
- Workflow triggers exclusively on `push: tags: v*.*.*` with `timeout-minutes: 60` and `permissions: packages: write` for GHCR auth via `GITHUB_TOKEN`

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin Dockerfile builder stage to BUILDPLATFORM** - `292ae28` (feat)
2. **Task 2: Create GitHub Actions publish workflow** - `6dcf4c3` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `.github/workflows/publish.yml` — Tag-triggered multi-arch build and push workflow (61 lines)
- `Dockerfile` — Added `ARG BUILDPLATFORM` and `--platform=${BUILDPLATFORM:-linux/amd64}` to builder stage only

## Decisions Made

- Builder stage pinned to `${BUILDPLATFORM:-linux/amd64}` so `npm ci` (compiling `better-sqlite3`) runs natively on the GitHub-hosted amd64 runner, not under QEMU emulation. Runtime stage left unpinned — BuildKit picks `TARGETPLATFORM` automatically.
- `timeout-minutes: 60` on the workflow job to handle slow ARM64 `better-sqlite3` compilation under QEMU (5–20x slower than native).
- `GITHUB_TOKEN` used for GHCR auth — no PAT creation or rotation needed; credentials auto-expire per workflow run.
- `metadata-action` with `flavor: latest=auto` and `type=semver` produces both the specific version tag (`v3.2.0`) and `latest` automatically from a single git tag push.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. The workflow runs automatically when a `v*.*.*` tag is pushed to GitHub. First-time GHCR usage may require linking the package to the repository in GHCR package settings (see research pitfall 5).

## Next Phase Readiness

- CI/CD pipeline ready: pushing `git tag v3.2.0 && git push origin v3.2.0` will trigger the workflow and produce `ghcr.io/design-dvw/documind:3.2.0` and `ghcr.io/design-dvw/documind:latest`
- Phase 15 plan 02 (DOCKER-USAGE.md documentation) can proceed — manual publish steps documented in research are ready to be added

---
*Phase: 15-ci-distribution*
*Completed: 2026-03-28*

## Self-Check: PASSED

- `.github/workflows/publish.yml` — FOUND
- `15-01-SUMMARY.md` — FOUND
- Commit `292ae28` (Task 1) — FOUND
- Commit `6dcf4c3` (Task 2) — FOUND
