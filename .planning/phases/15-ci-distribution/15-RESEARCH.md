# Phase 15: CI & Distribution — Research

**Researched:** 2026-03-28
**Domain:** GitHub Actions, Docker multi-arch builds (buildx + QEMU), GHCR publishing, semver tagging
**Confidence:** HIGH

---

## Summary

Phase 15 adds a GitHub Actions workflow that publishes a multi-arch Docker image to GHCR on every version tag push, plus documentation for manually doing the same build-and-push sequence. No application code changes. This is purely infrastructure: a `.github/workflows/` YAML file, a section in `docs/DOCKER-USAGE.md`, and possibly OCI labels added to the Dockerfile.

The standard toolchain for this is fully settled in 2026: `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/metadata-action`, and `docker/build-push-action` — all at v4, v5, v6, and v7 respectively. GHCR authentication uses the built-in `GITHUB_TOKEN` with `permissions: packages: write`. No external secrets are needed. The `docker/metadata-action` with `flavor: latest=auto` and `type=semver` tags automatically produces both the specific version tag (`v3.2.0`) and `latest` from a single git tag push.

The one meaningful technical risk for this project is `better-sqlite3`: it is a native Node.js module that requires compilation from source. Under QEMU emulation on a GitHub-hosted amd64 runner, the ARM64 `npm ci` step will compile `better-sqlite3` from source (no pre-built ARM64 binary for glibc/bookworm is distributed for all versions). This can take 10–40 minutes. The Dockerfile already uses a two-stage build, so the fix is to pin the builder stage with `FROM --platform=$BUILDPLATFORM` and use `--build-arg TARGETPLATFORM` to cross-compile, or accept the QEMU slowness and set a generous `timeout-minutes` on the workflow job.

**Primary recommendation:** Use the official Docker GitHub Actions action suite (qemu + buildx + metadata + build-push) with `GITHUB_TOKEN` for GHCR auth. Set `FROM --platform=$BUILDPLATFORM` in the Dockerfile builder stage to avoid QEMU-emulated compilation for native modules.

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |

|----|-------------|-----------------|

| CICD-01 | Documentation for manual docker build and push to GHCR | `docs/DOCKER-USAGE.md` already exists; add a "Publishing to GHCR" section with `docker buildx build --platform linux/amd64,linux/arm64 --push -t ghcr.io/...` command |

| CICD-02 | GitHub Actions workflow builds and pushes image on release | `.github/workflows/publish.yml` triggered on `push: tags: ['v*.*.*']`; uses docker/build-push-action@v7 + GITHUB_TOKEN |

| CICD-03 | Multi-arch image supports amd64 and arm64 | `platforms: linux/amd64,linux/arm64` in build-push-action; QEMU setup required; bookworm-slim base image already works on both |

| CICD-04 | Image tagged with version and latest | `docker/metadata-action@v6` with `type=semver,pattern={{version}}` + `flavor: latest=auto` outputs both tags automatically |

</phase_requirements>

---

## Standard Stack

### Core

| Tool / Action | Version | Purpose | Why Standard |

|---|---|---|---|

| `docker/setup-qemu-action` | `v4` | Installs QEMU for cross-arch emulation on amd64 runner | Required to build ARM64 image on GitHub-hosted runner without a native ARM runner |

| `docker/setup-buildx-action` | `v5` | Activates Docker Buildx builder with multi-platform support | Buildx is the only Docker build driver that supports `--platform linux/amd64,linux/arm64` in a single invocation |

| `docker/metadata-action` | `v6` | Generates OCI-compliant image tags and labels from git ref | Eliminates manual tag construction; `type=semver` + `flavor: latest=auto` handles version + latest in one config |

| `docker/build-push-action` | `v7` | Builds and pushes the multi-arch image to GHCR | Official action; handles context, platforms, cache, attestations |

| `actions/checkout` | `v5` | Checks out the repository | Required by build-push for build context |

| GHCR (`ghcr.io`) | — | Container registry | Free for public/private repos; tightly integrated with GitHub Actions via GITHUB_TOKEN; no external registry credentials needed |

### No Additional npm Packages

This phase introduces no new Node.js dependencies. It is entirely GitHub Actions YAML + Docker CLI.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |

|------------|-----------|----------|

| QEMU (single runner) | Native ARM runner (`ubuntu-24.04-arm`) split job | Native runner is faster but costs minutes; QEMU is free and acceptable for infrequent releases. The `better-sqlite3` compile-under-QEMU slowness makes native runners worth considering if build times exceed 30 min. |

| `GITHUB_TOKEN` | PAT stored as repo secret | PAT gives more control but introduces rotation burden; `GITHUB_TOKEN` is automatic and scoped per workflow run |

| `docker/metadata-action` | Manual tag construction | Manual tags are error-prone; metadata-action is the ecosystem standard |

---

## Architecture Patterns

### Recommended File Structure

```text

.github/
└── workflows/
    └── publish.yml      # Multi-arch build + GHCR push on version tag
docs/
└── DOCKER-USAGE.md      # Add "Publishing to GHCR" section (manual steps)
Dockerfile               # Add FROM --platform=$BUILDPLATFORM to builder stage

```

### Pattern 1: Tag-Triggered GHCR Workflow

**What:** A single workflow job that runs on `push: tags: ['v*.*.*']`, logs into GHCR with `GITHUB_TOKEN`, extracts semver tags via `metadata-action`, builds the multi-arch image via `build-push-action`, and pushes it.

**When to use:** Every time a new version is released by pushing a git tag.

#### Example:

```yaml

# Source: https://docs.docker.com/build/ci/github-actions/multi-platform/

# Source: https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions

name: Publish Docker Image

on:
  push:
    tags:

      - 'v*.*.*'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:

      - name: Checkout

        uses: actions/checkout@v5

      - name: Set up QEMU

        uses: docker/setup-qemu-action@v4

      - name: Set up Docker Buildx

        uses: docker/setup-buildx-action@v5

      - name: Log in to GHCR

        uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata

        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          flavor: |
            latest=auto
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}

      - name: Build and push

        uses: docker/build-push-action@v7
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

```

### Pattern 2: Manual Build + Push to GHCR

**What:** Developer runs these commands locally or in CI to build and push the multi-arch image without GitHub Actions.

**When to use:** One-off releases, testing the image before an automated release.

#### Example (add to docs/DOCKER-USAGE.md):

```bash

# Source: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry

# Authenticate

echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin

# Build multi-arch and push in one step (requires buildx)

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/design-dvw/documind:v3.2.0 \
  --tag ghcr.io/design-dvw/documind:latest \
  --push \
  .

```

### Pattern 3: Dockerfile Builder Stage Platform Pin

**What:** Pin the builder stage to the native build platform so `npm ci` (which compiles `better-sqlite3`) runs natively, not under QEMU emulation.

**When to use:** Always — this is required for any native Node.js module that needs compilation in a multi-arch Docker build.

#### Example (Dockerfile change):

```dockerfile

# Source: https://docs.docker.com/build/building/multi-platform/

# Pin builder to BUILDPLATFORM (native amd64 on GitHub runner)

# ARG must come BEFORE FROM to be available in FROM

ARG BUILDPLATFORM
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS builder

# ... rest of builder stage unchanged

# Runtime stage — no --platform arg, picks TARGETPLATFORM automatically

FROM node:22-bookworm-slim AS runtime

```

**Important:** The compiled `node_modules` from the builder will be amd64-native binaries. For the arm64 target, `better-sqlite3` will still need to be compiled for ARM64. The multi-arch Buildx runner handles this by running two separate builder executions (one per platform target), so pinning `$BUILDPLATFORM` helps the amd64 build, but the arm64 build still runs its `npm ci` under QEMU. The full solution requires either a native ARM runner or cross-compilation support in node-gyp (not standard for better-sqlite3). Document the `timeout-minutes: 60` safeguard for the workflow.

### Anti-Patterns to Avoid

- **Baking secrets into image labels:** The `docker/metadata-action` generates OCI labels; never add `GIT_TOKEN`, `DOCUMIND_MCP_TOKEN`, or any secret as a label or ARG.

- **Using `npm start` in CMD:** Already avoided in the existing Dockerfile (uses `node daemon/server.mjs` directly). Do not change this.

- **Pushing on every commit to main:** The workflow trigger must be `push: tags: ['v*.*.*']` only — not `push: branches: [master]`.

- **Forgetting `permissions: packages: write`:** Without this, `GITHUB_TOKEN` has only read access to packages and the push will fail with a 403.

- **Using deprecated SSE MCP transport:** Not relevant to this phase, but the REQUIREMENTS.md explicitly calls it out as out of scope — do not add any SSE workflow steps.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |

|---------|-------------|-------------|-----|

| Semver tag extraction | bash `echo $GITHUB_REF \| sed ...` | `docker/metadata-action@v6` | Handles pre-releases, strip `v` prefix, `latest` logic, OCI labels — 20+ edge cases |

| Multi-arch image push | Manual `docker manifest create` | `docker/build-push-action@v7` with `platforms:` | BuildKit handles layer separation, manifest lists, registry push atomically |

| GHCR login | `curl` to registry API | `docker/login-action@v4` with `GITHUB_TOKEN` | Handles credential scoping, refresh, org-level package visibility automatically |

| GitHub Actions cache | Custom cache steps | `cache-from: type=gha` in build-push-action | Native GitHub Actions cache integration, no S3 setup needed |

**Key insight:** The Docker GitHub Actions action suite is the canonical toolchain. Every piece of it handles significant edge-case complexity that custom scripts will miss.

---

## Common Pitfalls

### Pitfall 1: Missing `permissions: packages: write`

**What goes wrong:** Workflow runs, reaches the push step, and fails with `denied: permission_denied` or a 403 from `ghcr.io`.

**Why it happens:** GitHub Actions workflows default to read-only package permissions. The `GITHUB_TOKEN` needs `packages: write` explicitly granted in the workflow file.

**How to avoid:** Include the permissions block on the job (not just the workflow level):

```yaml

permissions:
  contents: read
  packages: write

```

**Warning signs:** `Error: buildx call failed with: exit status 1` during the push step with a 403 in the preceding lines.

### Pitfall 2: `better-sqlite3` ARM64 Compile Time Under QEMU

**What goes wrong:** The ARM64 platform build takes 20–60 minutes because `better-sqlite3` has no pre-built N-API ARM64 binary for glibc/bookworm and must compile from source under QEMU emulation.

**Why it happens:** QEMU translates every ARM64 instruction to x86-64. CPU-bound compilation (C++ via node-gyp) is 5–20x slower under emulation.

**How to avoid:** Add `timeout-minutes: 60` to the workflow job. Optionally use a split-job approach with a native `ubuntu-24.04-arm` runner for the ARM64 build and merge with `docker buildx imagetools create`.

**Warning signs:** ARM64 build step hangs at `> [builder 7/7] RUN npm ci` for more than 10 minutes.

### Pitfall 3: Image Not Linked to Repository in GHCR

**What goes wrong:** The image appears in GHCR but is listed under the actor's account, not the repository. Package visibility settings are separate from repo visibility.

**Why it happens:** Without the `org.opencontainers.image.source` OCI label, GHCR does not automatically link the package to the source repository.

**How to avoid:** The `docker/metadata-action` outputs the correct OCI labels (including `org.opencontainers.image.source`) automatically. Pass `labels: ${{ steps.meta.outputs.labels }}` to `build-push-action`. Do not skip the labels output.

**Warning signs:** Image appears under personal account at `ghcr.io/ACTOR/documind` instead of `ghcr.io/design-dvw/documind`.

### Pitfall 4: Tag `latest` Not Generated

**What goes wrong:** Only the specific version tag (`v3.2.0`) is pushed; `latest` is absent.

**Why it happens:** `docker/metadata-action` does not generate `latest` unless `flavor: latest=auto` is set or a `type=raw,value=latest` tag rule is added. Default flavor behavior for semver is `latest=auto`, but this only applies when the version is not a pre-release (e.g., not `v3.2.0-beta.1`).

**How to avoid:** Explicitly set `flavor: latest=auto` in the metadata-action configuration. This is the default but being explicit prevents confusion.

**Warning signs:** `docker pull ghcr.io/design-dvw/documind:latest` fails with "not found" after a release push.

### Pitfall 5: `docker login` on a Tag Push Using `GITHUB_TOKEN`

**What goes wrong:** On some GitHub org configurations, `GITHUB_TOKEN` cannot push to GHCR for packages that were previously created by a PAT. The error is `denied: permission_denied` even with the correct permissions block.

**Why it happens:** GHCR package access control is separate from repository access control. If the package was ever created under a PAT, the `GITHUB_TOKEN` may lack access until the package is explicitly linked to the repository.

**How to avoid:** After the first successful push, go to the GHCR package settings and under "Manage Actions access", add the DocuMind repository. For new packages pushed entirely by `GITHUB_TOKEN`, this linkage happens automatically.

**Warning signs:** First push from workflow fails; subsequent pushes work after manually linking the package.

---

## Code Examples

### Complete `publish.yml` Workflow

```yaml

# .github/workflows/publish.yml

# Source: https://docs.docker.com/build/ci/github-actions/multi-platform/

# Source: https://github.com/docker/metadata-action (v6 README)

name: Publish Docker Image

on:
  push:
    tags:

      - 'v*.*.*'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
      packages: write

    steps:

      - name: Checkout

        uses: actions/checkout@v5

      - name: Set up QEMU

        uses: docker/setup-qemu-action@v4

      - name: Set up Docker Buildx

        uses: docker/setup-buildx-action@v5

      - name: Log in to GHCR

        uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags and labels)

        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          flavor: |
            latest=auto
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}

      - name: Build and push multi-arch image

        uses: docker/build-push-action@v7
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

```

### Manual GHCR Publish (documentation addition)

```bash

# Source: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry

# Step 1: Create a PAT with write:packages scope at github.com/settings/tokens

# Step 2: Authenticate

export CR_PAT=ghp_your_token_here
echo $CR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Step 3: Build and push multi-arch image (requires buildx + QEMU installed locally)

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/design-dvw/documind:v3.2.0 \
  --tag ghcr.io/design-dvw/documind:latest \
  --push \
  .

# Step 4: Verify

docker buildx imagetools inspect ghcr.io/design-dvw/documind:v3.2.0

```

### Dockerfile Builder Stage Pin (optional optimization)

```dockerfile

# Source: https://docs.docker.com/build/building/multi-platform/

# Pin builder to native build platform to avoid QEMU overhead during npm ci

ARG BUILDPLATFORM
FROM --platform=${BUILDPLATFORM:-linux/amd64} node:22-bookworm-slim AS builder

# ... rest of builder stage is unchanged

FROM node:22-bookworm-slim AS runtime

# ... rest of runtime stage unchanged

```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |

|---|---|---|---|

| `docker manifest create` + separate `docker push` per arch | `docker buildx build --platform ... --push` | Docker 19.03 (BuildKit) | Single command builds and pushes multi-arch manifest list |

| `docker push` to GHCR with PAT | `GITHUB_TOKEN` with `permissions: packages: write` | GitHub Actions 2021 | No PAT rotation; credentials auto-expire per workflow run |

| SSE transport for MCP | Streamable HTTP only | MCP spec 2025-03-26 | Out of scope for this phase; noted here for completeness |

| `metadata-action` v4 with `type=semver` | `metadata-action` v6 with `flavor: latest=auto` | 2024 | Cleaner latest tag handling; v5 had a breaking change in tag output format |

### Deprecated/outdated:

- `docker/build-push-action@v4` and earlier: deprecated; v7 is current as of 2025

- Building ARM64 via separate `docker build --platform linux/arm64 -t ...` + `docker manifest create`: replaced by buildx single-invocation approach

---

## Open Questions

1. **GitHub org name for GHCR image path**

   - What we know: The git remote is `github.com/DESIGN-DVW/DocuMind.git`, so `${{ github.repository }}` will resolve to `DESIGN-DVW/documind` (lowercased by GHCR). The image will be at `ghcr.io/design-dvw/documind`.

   - What's unclear: Whether the DESIGN-DVW org has Actions enabled for GHCR package publishing without additional org-level settings.

   - Recommendation: Test with a manual push from a local machine first to verify the org's GHCR settings before relying on the Actions workflow.

2. **`better-sqlite3` ARM64 build time under QEMU**

   - What we know: QEMU emulation makes ARM64 compilation 5–20x slower. The Dockerfile builder stage runs `npm ci` which compiles `better-sqlite3` from source.

   - What's unclear: Actual build time on GitHub-hosted runners. Could be 10 minutes or 60 minutes depending on runner resources.

   - Recommendation: Set `timeout-minutes: 60` in the workflow and monitor the first run. If it regularly exceeds 20 minutes, switch to a split-job strategy with `ubuntu-24.04-arm` runner for the arm64 build.

3. **Package visibility (public vs. private)**

   - What we know: GHCR packages inherit visibility from the repository by default for org repos.

   - What's unclear: Whether the intent is for the image to be public (pullable without auth) or private.

   - Recommendation: For an open-source tool, set the package to public after the first push via GHCR package settings. The workflow works the same either way.

---

## Sources

### Primary (HIGH confidence)

- [Docker multi-platform GitHub Actions docs](https://docs.docker.com/build/ci/github-actions/multi-platform/) — complete workflow pattern, QEMU setup, buildx configuration

- [docker/metadata-action GitHub README](https://github.com/docker/metadata-action) — v6 flavor/tags configuration, semver patterns, latest=auto behavior

- [GitHub Docs: Publishing packages with GitHub Actions](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions) — GITHUB_TOKEN permissions, complete workflow example

- [GitHub Docs: Working with the Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) — GHCR authentication, image naming conventions, manual publish steps

- [Docker multi-platform build docs](https://docs.docker.com/build/building/multi-platform/) — BUILDPLATFORM/TARGETPLATFORM ARG, cross-compilation pattern

### Secondary (MEDIUM confidence)

- [better-sqlite3 issue #771](https://github.com/WiseLibs/better-sqlite3/issues/771) — confirms ARM64 docker lacks prebuilt binaries, requires compilation from source

- [actuated.com: Multi-arch Docker GitHub Actions](https://actuated.com/blog/multi-arch-docker-github-actions) — confirms QEMU slowness, native runner as alternative; verified against Docker official docs

### Tertiary (LOW confidence)

- [Docker build tags and labels docs](https://docs.docker.com/build/ci/github-actions/manage-tags-labels/) — additional metadata-action tag pattern examples

---

## Metadata

### Confidence breakdown:

- Standard stack: HIGH — Docker action suite versions verified against official GitHub repos; GITHUB_TOKEN workflow verified against GitHub official docs

- Architecture: HIGH — Canonical workflow pattern from Docker official docs; pitfalls verified against multiple sources

- Pitfalls: MEDIUM-HIGH — QEMU slowness for native modules confirmed by better-sqlite3 issues and Docker multi-platform docs; GITHUB_TOKEN permissions issue confirmed by GitHub community discussions

**Research date:** 2026-03-28
**Valid until:** 2026-06-28 (GitHub Actions action versions move slowly; check for v8 of build-push-action if planning after this date)
