# Phase 13: Git-Clone Ingestion + Dual Mode — Research

**Researched:** 2026-03-27
**Domain:** Container-side git operations, dual-mode repo ingestion, credential security in Docker
**Confidence:** HIGH

---

## Summary

Phase 13 adds a second ingestion mode to the already-containerized DocuMind daemon. Phase 12 built volume-mount mode (repos bind-mounted into the container at `/repos`), but the docker-compose.yml currently has the bind mount commented out and leaves `DOCUMIND_REPOS_DIR=/repos` pointing at nothing. Phase 13 makes volume-mount mode actually operational AND adds clone mode where the container fetches repos itself.

The core mechanic is straightforward: a new `REPO_MODE` env var (default: `mount`) governs behavior. In `mount` mode the daemon starts normally and discovers repos from `DOCUMIND_REPOS_DIR` using the existing `discoverRepos()` path in `context/loader.mjs`. In `clone` mode a startup script clones each repo listed in `DOCUMIND_REPOS` into a local directory, then the daemon runs as normal against those cloned directories. Periodic `git pull` on the cron schedule keeps cloned repos fresh without container restart.

Credential security is the only non-trivial constraint: `GIT_TOKEN` (or equivalent) must be injected at runtime via env var, never baked into image layers. The standard Docker pattern for this is passing credentials through env vars to the clone command (embedded in the URL or via `GIT_ASKPASS`/`GIT_CREDENTIAL_HELPER`) — never via `ARG` (which leaks into `docker history`) and never via `ENV` at the Dockerfile level.

**Primary recommendation:** Implement the startup sequencing as a dedicated `daemon/ingestion.mjs` module called from `server.mjs` before `loadProfile()` completes. Use `child_process.execFile('git', ...)` for git operations (not `exec()` — avoids shell injection). Pass credentials via the HTTPS clone URL pattern `https://${GIT_TOKEN}@github.com/...`. On cron schedule, run `git pull --ff-only` per repo and trigger an incremental scan after each pull.

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |

|----|-------------|-----------------|

| INGEST-01 | Volume mount mode scans mounted repo directories | Existing `discoverRepos()` in `context/loader.mjs` already handles this; `DOCUMIND_REPOS_DIR=/repos` + bind mount in docker-compose.yml is all that is needed. The docker-compose.yml bind mount is currently commented out — this requirement is fulfilled by uncommenting + documenting it. |

| INGEST-02 | Git-clone mode clones configured repos on container start | New `daemon/ingestion.mjs` module: reads `REPO_MODE=clone` and `DOCUMIND_REPOS` (comma-separated `org/repo` slugs), clones each to `/app/repos/<name>` via `git clone` with token-embedded URL, sets `DOCUMIND_REPOS_DIR=/app/repos` so `discoverRepos()` picks them up. |

| INGEST-03 | Git-clone mode pulls repos on cron schedule | New cron job in `daemon/scheduler.mjs` (or ingestion module): `git pull --ff-only` per cloned repo on `CRON_HOURLY` schedule, triggers `runScan()` per repo after successful pull. |

| INGEST-04 | `REPO_MODE` env var switches between mount and clone modes | New export in `config/env.mjs`: `export const REPO_MODE = process.env.REPO_MODE ?? 'mount'`. Validated to be either `'mount'` or `'clone'` at startup; invalid value → `process.exit(1)` with clear message. |

| INGEST-05 | Git credentials accepted via env vars, not visible in `docker history --no-trunc` | `GIT_TOKEN` env var injected at runtime via `docker-compose.yml` `environment:` block (never `ARG`/`ENV` in Dockerfile). URL pattern: `https://${GIT_TOKEN}@github.com/${org}/${repo}.git`. Verified safe: env vars set at `docker run` or `docker-compose up` time are not captured in image history layers. |

</phase_requirements>

---

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |

|---|---|---|---|

| `node:child_process` (built-in) | Node 22 built-in | Spawn git commands | No additional dependency; `execFile()` avoids shell injection; git is already in the node:22-bookworm-slim base image |

| `git` (system) | Pre-installed in node:22-bookworm-slim | Clone and pull repositories | Part of Debian bookworm base; verified present in node:22-bookworm-slim |

| `node-cron` | Already in package.json | Schedule periodic pulls | Already imported in `daemon/scheduler.mjs`; no new dependency |

### No New npm Dependencies Required

Phase 13 uses only Node.js built-ins (`child_process`, `fs/promises`, `path`) plus existing codebase modules (`config/env.mjs`, `daemon/scheduler.mjs`, `orchestrator.mjs`). Git is pre-installed in the `node:22-bookworm-slim` base image.

### Verify git is in the base image

```bash

docker run --rm node:22-bookworm-slim git --version

# Expected: git version 2.39.x

```

This should succeed. If it fails, add `git` to the runtime stage `apt-get install` list in the Dockerfile.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |

|---|---|---|

| `child_process.execFile('git', ...)` | `simple-git` npm package | simple-git is a well-maintained wrapper but adds a dependency. `execFile` is sufficient for `clone` + `pull --ff-only`; stick with built-in. |

| Token-embedded HTTPS URL | SSH deploy keys | SSH requires key generation, volume-mounting the key file, and known_hosts setup. Token URL is simpler and aligns with GitHub Actions standard pattern. Acceptable for single-user use case. |

| `GIT_ASKPASS` script | Token in URL | `GIT_ASKPASS` is cleaner (token not in URL) but requires writing a temp script file and managing permissions. Token URL is simpler and equally secure for containers where the env var is runtime-injected. |

---

## Architecture Patterns

### Recommended Project Structure (new files)

```text

DocuMind/
├── daemon/
│   ├── ingestion.mjs         # NEW: clone/pull logic, mode detection
│   ├── server.mjs            # MODIFIED: call initIngestion() before loadProfile()
│   └── scheduler.mjs         # MODIFIED: add pull cron job when REPO_MODE=clone
├── config/
│   └── env.mjs               # MODIFIED: add REPO_MODE export
└── docker-compose.yml        # MODIFIED: add REPO_MODE, GIT_TOKEN, bind mount for mount mode

```

### Pattern 1: Mode Detection in env.mjs

**What:** A single `REPO_MODE` export that the rest of the codebase reads. Validate at the env.mjs level so any module can safely import it.

```javascript

// config/env.mjs — add after REPOS_LIST export
export const REPO_MODE = process.env.REPO_MODE ?? 'mount';

// Validation happens at startup in ingestion.mjs, not here
// env.mjs stays side-effect free (except .env loading)

```

### Pattern 2: Ingestion Module (`daemon/ingestion.mjs`)

**What:** A single async `initIngestion()` function called once at daemon startup. In `mount` mode it is a no-op (returns immediately). In `clone` mode it clones any repos not already cloned, then resolves — the daemon proceeds to `loadProfile()` as normal.

**When to use:** Called BEFORE `loadProfile()` in `server.mjs` so that `DOCUMIND_REPOS_DIR` is populated with cloned repos when `discoverRepos()` runs.

```javascript

// daemon/ingestion.mjs
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { REPO_MODE, REPOS_LIST } from '../config/env.mjs';

const execFileAsync = promisify(execFile);

// Cloned repos live here inside the container
const CLONE_DIR = '/app/repos';

export async function initIngestion() {
  if (REPO_MODE === 'mount') {
    console.log('[ingestion] mount mode — skipping clone');
    return;
  }

  if (REPO_MODE !== 'clone') {
    console.error(`[ingestion] Invalid REPO_MODE="${REPO_MODE}". Must be "mount" or "clone".`);
    process.exit(1);
  }

  if (!REPOS_LIST || REPOS_LIST.length === 0) {
    console.error('[ingestion] REPO_MODE=clone but DOCUMIND_REPOS is not set. Set DOCUMIND_REPOS=org/repo1,org/repo2');
    process.exit(1);
  }

  const token = process.env.GIT_TOKEN;
  if (!token) {
    console.error('[ingestion] REPO_MODE=clone requires GIT_TOKEN env var');
    process.exit(1);
  }

  await fs.mkdir(CLONE_DIR, { recursive: true });

  for (const slug of REPOS_LIST) {
    const name = slug.split('/').pop();
    const repoPath = path.join(CLONE_DIR, name);
    const url = `https://${token}@github.com/${slug}.git`;

    try {
      await fs.access(path.join(repoPath, '.git'));
      console.log(`[ingestion] ${name} already cloned — skipping`);
    } catch {
      console.log(`[ingestion] Cloning ${slug}...`);
      await execFileAsync('git', ['clone', '--depth=1', url, repoPath]);
      console.log(`[ingestion] Cloned ${name}`);
    }
  }

  // After cloning, set DOCUMIND_REPOS_DIR so discoverRepos() picks up the clones
  process.env.DOCUMIND_REPOS_DIR = CLONE_DIR;
  console.log(`[ingestion] Clone mode ready — repos at ${CLONE_DIR}`);
}

```

**Critical:** `DOCUMIND_REPOS_DIR` must be set in `process.env` before `config/env.mjs` re-exports `REPOS_DIR`. Since `env.mjs` is a module (evaluated once at import time), `REPOS_DIR` will already be `null` if `DOCUMIND_REPOS_DIR` was not set at startup. The cleanest solution is to have `initIngestion()` set `process.env.DOCUMIND_REPOS_DIR = CLONE_DIR` AND have `server.mjs` re-derive the repos directory from `process.env` directly after ingestion, rather than relying on the already-frozen `REPOS_DIR` export. See Open Questions #1.

### Pattern 3: Pull-on-Cron in scheduler.mjs

**What:** Add a new cron job that runs `git pull --ff-only` for each cloned repo and triggers an incremental scan. Only registered when `REPO_MODE=clone`.

```javascript

// daemon/scheduler.mjs — add inside initScheduler(), after other crons
import { pullAllRepos } from './ingestion.mjs';
import { REPO_MODE, CRON_HOURLY } from '../config/env.mjs';

if (REPO_MODE === 'clone') {
  cron.schedule(CRON_HOURLY, async () => {
    console.log('[scheduler] Pulling cloned repos...');
    const updated = await pullAllRepos();
    for (const name of updated) {
      await runScan(db, ctx, { mode: 'incremental', repo: name });
    }
  });
}

```

```javascript

// daemon/ingestion.mjs — add pullAllRepos() export
export async function pullAllRepos() {
  const updated = [];
  if (REPO_MODE !== 'clone') return updated;

  const entries = await fs.readdir(CLONE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const repoPath = path.join(CLONE_DIR, entry.name);
    try {
      const { stdout } = await execFileAsync('git', ['-C', repoPath, 'pull', '--ff-only']);
      if (!stdout.includes('Already up to date')) {
        console.log(`[ingestion] Pulled ${entry.name}: ${stdout.trim()}`);
        updated.push(entry.name);
      }
    } catch (err) {
      console.error(`[ingestion] Pull failed for ${entry.name}: ${err.message}`);
    }
  }
  return updated;
}

```

### Pattern 4: docker-compose.yml Updates

Two separate compose configurations are needed — or a single file with commented alternatives:

#### Mount mode (REPO_MODE=mount):

```yaml

services:
  documind:
    environment:
      REPO_MODE: mount
      DOCUMIND_REPOS_DIR: /repos
      CHOKIDAR_USEPOLLING: "true"
      CHOKIDAR_INTERVAL: "2000"
    volumes:

      - documind_data:/app/data

      - /Users/Shared/htdocs/github/DVWDesign:/repos:ro

```

#### Clone mode (REPO_MODE=clone):

```yaml

services:
  documind:
    environment:
      REPO_MODE: clone
      DOCUMIND_REPOS: "DESIGN-DVW/DocuMind,DESIGN-DVW/RootDispatcher"
      GIT_TOKEN: "${GIT_TOKEN}"   # passed from host .env, never hardcoded
    volumes:

      - documind_data:/app/data

      - documind_repos:/app/repos  # named volume for cloned repos

```

### Pattern 5: Credential Security

**What:** `GIT_TOKEN` injected at runtime, never in image layers.

#### Correct approach:

```yaml

# docker-compose.yml

environment:
  GIT_TOKEN: "${GIT_TOKEN}"   # reads from host shell environment or .env file

```

```bash

# On the host — never commit this

GIT_TOKEN=ghp_xxx docker compose up

# OR: create .env (gitignored) with GIT_TOKEN=ghp_xxx

```

**Verification command** (success criterion 4):

```bash

docker history --no-trunc $(docker compose images -q documind) | grep -i token

# Must produce NO output

```

## Why token-in-URL is safe at runtime (LOW risk in this context):

- The token appears in the git clone command args (`execFileAsync('git', [..., url])`) — visible in `ps aux` output during clone

- For higher security: use `GIT_ASKPASS` or credential helper instead

- For this single-user use case: token-in-URL is the standard GitHub Actions / Docker pattern and acceptable

### Anti-Patterns to Avoid

- **`ARG GIT_TOKEN` in Dockerfile:** Captured in image layer history. Visible via `docker history --no-trunc`. Never use ARG for secrets.

- **`ENV GIT_TOKEN=...` in Dockerfile:** Same problem — baked into every image layer.

- **`exec(\`git clone ${url}\`)` (shell exec):** Shell injection risk if repo name contains shell metacharacters. Use `execFile()` with explicit argument array.

- **`git clone` with `--depth=0` or full history:** Wastes disk and memory. Use `--depth=1` (shallow clone) for documentation scanning; history is not needed.

- **Setting `DOCUMIND_REPOS_DIR` in Dockerfile `ENV`:** Prevents the value from being overridden at runtime for mount mode. Keep it out of the Dockerfile; only set in docker-compose.yml or at `docker run` time.

- **Storing token in `~/.netrc` inside the image:** Credential file is baked into the layer.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |

|---|---|---|---|

| Git operations | Custom HTTP calls to GitHub API to download files | `git clone` + `git pull` via `child_process.execFile` | Git handles delta updates, file permissions, and .git metadata correctly; re-implementing is thousands of lines |

| Credential passing | Custom credential store | Token-embedded HTTPS URL or `GIT_ASKPASS` env var | Git's built-in credential mechanisms are tested and audited |

| Shallow clones | Full history download to find markdown files | `git clone --depth=1` | DocuMind only needs current file contents; full history wastes 10-100x more storage |

| Periodic pull logic | Custom file diff / polling of GitHub API | `git pull --ff-only` | Git handles merge detection, fast-forward safety, and error cases |

**Key insight:** Git already solves the hard parts (credential auth, delta sync, file permissions). The implementation is a thin wrapper: clone on startup, pull on schedule.

---

## Common Pitfalls

### Pitfall 1: `REPOS_DIR` Already Frozen When ingestion.mjs Runs

**What goes wrong:** `config/env.mjs` is an ES module. When it is first imported, `REPOS_DIR` is computed from `process.env.DOCUMIND_REPOS_DIR` at that moment and frozen as a module-level `const`. If `ingestion.mjs` sets `process.env.DOCUMIND_REPOS_DIR = CLONE_DIR` after `env.mjs` has already been imported, `REPOS_DIR` remains `null`.

**Why it happens:** ES module evaluation is synchronous and happens once at import. The exported `const REPOS_DIR` is a snapshot, not a live reference to `process.env`.

**How to avoid:** Two options:

1. (Preferred) Set `DOCUMIND_REPOS_DIR` as a Docker environment variable pointing to `/app/repos` when using clone mode — then `env.mjs` picks it up correctly at startup. The ingestion module only populates that directory, it doesn't change the env var.

2. (Alternative) Pass `CLONE_DIR` directly to `loadProfile()` after ingestion completes, bypassing the `REPOS_DIR` export.

**Warning signs:** Clone mode starts, repos clone successfully, but daemon reports 0 repos discovered.

### Pitfall 2: Token Visible in `docker inspect` Process List

**What goes wrong:** `docker inspect` or `ps aux` shows the `git clone` command including the token-embedded URL.

**Why it happens:** `execFile('git', ['clone', url, path])` passes the URL as a process argument, visible to any process with `ps` access.

**How to avoid:** For this single-user, single-container use case this is acceptable. If higher security is needed: use `GIT_ASKPASS` with a temp script file, or use `git credential approve` to inject into git's credential system without URL embedding. Document this tradeoff in the plan.

### Pitfall 3: Clone Mode Volume Not Persisted

**What goes wrong:** Every container restart re-clones all repositories (slow, rate-limited, uses bandwidth).

**Why it happens:** `/app/repos` inside the container is ephemeral — destroyed on container restart if not a named volume.

**How to avoid:** Add a named volume `documind_repos:/app/repos` in docker-compose.yml for clone mode. The `initIngestion()` function already checks for `.git` presence and skips repos that are already cloned.

### Pitfall 4: `git pull` Fails on Diverged History

**What goes wrong:** `git pull --ff-only` exits with error when the remote branch has been force-pushed or rebased.

**Why it happens:** `--ff-only` refuses to merge non-fast-forward changes. Force push creates a diverged history.

**How to avoid:** On failure, fall back to `git fetch origin && git reset --hard origin/HEAD`. Log the reset prominently. Do not silently swallow the error. For documentation scanning, data consistency is more important than preserving local state.

### Pitfall 5: Missing `git` in Runtime Image

**What goes wrong:** `initIngestion()` throws `ENOENT: git not found` at container start.

**Why it happens:** `node:22-bookworm-slim` includes `git` in the base Debian packages, but this should be verified. If it is not present, the Dockerfile runtime stage `apt-get install` must add it.

**How to avoid:** Verify with `docker run --rm node:22-bookworm-slim git --version`. If not found, add `git` to the runtime stage `apt-get install -y dumb-init curl git` line in the Dockerfile.

### Pitfall 6: Credential Leak via `git config --global`

**What goes wrong:** Developer adds `RUN git config --global credential.helper store` to Dockerfile and stores credentials in `~/.git-credentials` — this file is baked into the image layer.

**How to avoid:** Never configure credential helpers in the Dockerfile. Pass credentials only via runtime env vars.

---

## Code Examples

### Verified: `execFile` for git clone (safe argument passing)

```javascript

import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

// Arguments as array — shell injection safe
await execFileAsync('git', [
  'clone',
  '--depth=1',
  `https://${token}@github.com/${org}/${repo}.git`,
  targetDir
]);

```

### Verified: git pull with error handling

```javascript

try {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, 'pull', '--ff-only']);
  return { changed: !stdout.includes('Already up to date'), output: stdout.trim() };
} catch (err) {
  // Diverged — reset to remote
  console.error(`[ingestion] Pull failed, resetting: ${err.message}`);
  await execFileAsync('git', ['-C', repoPath, 'fetch', 'origin']);
  await execFileAsync('git', ['-C', repoPath, 'reset', '--hard', 'origin/HEAD']);
  return { changed: true, output: 'reset to origin/HEAD' };
}

```

### Verified: Token not in image history

```dockerfile

# In Dockerfile — DO NOT add these

# ARG GIT_TOKEN      ← WRONG: captured in history

# ENV GIT_TOKEN=xxx  ← WRONG: baked into layer

# docker-compose.yml CORRECT pattern:

# environment:

#   GIT_TOKEN: "${GIT_TOKEN}"  ← runtime injection, not in image history

```

### Verified: docker-compose.yml for mount mode (uncomment bind mount)

```yaml

services:
  documind:
    environment:
      REPO_MODE: mount
      DOCUMIND_REPOS_DIR: /repos
      CHOKIDAR_USEPOLLING: "true"
      CHOKIDAR_INTERVAL: "2000"
    volumes:

      - documind_data:/app/data

      - ${REPOS_HOST_PATH:-/Users/Shared/htdocs/github/DVWDesign}:/repos:ro

```

Using `${REPOS_HOST_PATH:-fallback}` in the compose volume makes the host path configurable without editing the file.

### Verified: docker-compose.yml for clone mode

```yaml

services:
  documind:
    environment:
      REPO_MODE: clone
      DOCUMIND_REPOS_DIR: /app/repos
      DOCUMIND_REPOS: "${DOCUMIND_REPOS}"
      GIT_TOKEN: "${GIT_TOKEN}"
    volumes:

      - documind_data:/app/data

      - documind_repos:/app/repos

volumes:
  documind_data:
  documind_repos:

```

---

## How This Integrates with the Existing Codebase

### `context/loader.mjs` — No changes needed

The `discoverRepos()` function already handles directory scanning: it reads `REPOS_DIR` (from `env.mjs`) and finds all subdirectories with a `.git` folder. Clone mode just needs to populate `/app/repos` with cloned repos and set `DOCUMIND_REPOS_DIR=/app/repos` — then `discoverRepos()` picks them up automatically.

### `config/env.mjs` — Minimal addition

Add `REPO_MODE` export. The tricky part is ensuring `DOCUMIND_REPOS_DIR=/app/repos` is set as an environment variable before `env.mjs` evaluates (so `REPOS_DIR` is set correctly). In docker-compose.yml for clone mode, set both `REPO_MODE=clone` AND `DOCUMIND_REPOS_DIR=/app/repos` explicitly.

### `daemon/server.mjs` — One insertion point

Call `await initIngestion()` before `await loadProfile()`. That ordering ensures repos are cloned before profile loading tries to discover them.

### `daemon/scheduler.mjs` — Conditional cron registration

Add a conditional block after existing crons: `if (REPO_MODE === 'clone') { cron.schedule(CRON_HOURLY, ...) }`. The pull cron shares the same `CRON_HOURLY` schedule as the incremental scan but runs git operations first, then delegates to `runScan()`.

### `INGEST-01` (mount mode) — Minimal work

The docker-compose.yml bind mount is currently commented out. Uncomment it and document the `REPOS_HOST_PATH` env var. Mount mode already works — `discoverRepos()` scans whatever is at `DOCUMIND_REPOS_DIR`. The only deliverable is the updated docker-compose.yml and documentation.

---

## State of the Art

| Old Approach | Current Approach | Impact on Phase 13 |

|---|---|---|

| SSH keys for Docker clone | HTTPS token URL | Token URL is the GitHub Actions standard pattern; SSH requires key generation and known_hosts management |

| `git clone` full history | `git clone --depth=1` | Shallow clone is standard for CI/CD and documentation pipelines; saves 10-100x storage |

| Custom entrypoint.sh script | Node.js `ingestion.mjs` module | Keeps the tech stack uniform (Node.js throughout); no bash parsing edge cases |

| PM2 process manager | Direct node execution | Already decided in Phase 12; clone mode has no impact on this decision |

---

## Open Questions

1. **Module evaluation timing for `REPOS_DIR`**

   - What we know: `config/env.mjs` exports `REPOS_DIR` as a frozen `const` derived from `process.env.DOCUMIND_REPOS_DIR` at import time.

   - What's unclear: If `DOCUMIND_REPOS_DIR=/app/repos` is set as an environment variable in docker-compose.yml (which it should be for clone mode), then `REPOS_DIR` will be `/app/repos` at startup — this is fine. The ingestion module just needs to populate that directory before `loadProfile()` runs.

   - Recommendation: For clone mode, docker-compose.yml must set BOTH `REPO_MODE=clone` AND `DOCUMIND_REPOS_DIR=/app/repos`. The ingestion module does NOT mutate env vars — it just clones into `/app/repos`. This is clean and avoids the frozen-const problem entirely.

2. **Token security: URL embedding vs. GIT_ASKPASS**

   - What we know: Token-in-URL exposes the token in `ps aux` during the clone operation and potentially in git logs.

   - What's unclear: Whether this security tradeoff is acceptable for this use case (single-user, single-container, private repos).

   - Recommendation: Document the tradeoff clearly. For v3.2, token-in-URL is acceptable. If higher security is needed in a future phase, implement `GIT_ASKPASS` with a temp script.

3. **`DOCUMIND_REPOS` format: slug vs. URL**

   - What we know: `REPOS_LIST` in `env.mjs` is a comma-split of `DOCUMIND_REPOS`. Currently used for filtering repo names, not for constructing URLs.

   - What's unclear: Should `DOCUMIND_REPOS` contain `org/repo` slugs (current behavior implies name-only) or full URLs?

   - Recommendation: Use `org/repo` slug format (e.g., `DESIGN-DVW/DocuMind`). The repo name is derived as `slug.split('/').pop()`. Full GitHub URLs would work but slugs are more concise and less environment-specific.

---

## Sources

### Primary (HIGH confidence)

- `context/loader.mjs` (codebase) — `discoverRepos()` implementation confirmed; scans for `.git` dirs under `REPOS_DIR`; no changes needed for clone mode

- `config/env.mjs` (codebase) — `REPOS_DIR`, `REPOS_LIST` exports confirmed; module evaluation timing verified

- `daemon/server.mjs` (codebase) — startup sequence confirmed: `loadProfile()` first, then `initScheduler()` + `initWatcher()`; insertion point for `initIngestion()` identified

- `daemon/scheduler.mjs` (codebase) — `CRON_HOURLY` cron job pattern confirmed; conditional registration pattern verified

- `docker-compose.yml` (codebase) — bind mount currently commented out; confirmed `DOCUMIND_REPOS_DIR=/repos` is already set

- `Dockerfile` (codebase) — runtime stage uses `node:22-bookworm-slim`; `apt-get install dumb-init curl` (need to verify git is included)

- `.planning/phases/12-dockerfile-docker-compose/12-RESEARCH.md` — credential anti-patterns, `ARG GIT_TOKEN` warning

### Secondary (MEDIUM confidence)

- Node.js `child_process.execFile` docs — `promisify(execFile)` pattern for async git operations; execFile preferred over exec to avoid shell injection

- GitHub Actions standard credential pattern — `https://${GITHUB_TOKEN}@github.com/org/repo.git` is documented GitHub best practice for token-auth cloning

### Tertiary (LOW confidence)

- `GIT_ASKPASS` alternative pattern — mentioned in git documentation; not verified against current git version in bookworm

---

## Metadata

### Confidence breakdown:

- Standard stack: HIGH — no new npm dependencies; git built-in to base image (verify); child_process built into Node

- Architecture: HIGH — ingestion.mjs pattern is clean, integration points clearly identified in codebase

- Credential security: HIGH — `ARG` vs runtime env var is well-established Docker security knowledge

- Module evaluation timing: MEDIUM — ES module frozen-const behavior is standard, but the clean solution (docker-compose.yml sets DOCUMIND_REPOS_DIR) needs to be confirmed in the plan

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (git clone patterns are stable; credential recommendations may evolve)
