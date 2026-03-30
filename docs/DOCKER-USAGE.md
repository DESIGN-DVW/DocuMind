# Docker Usage Guide

**Version:** 1.0.0
**Created:** 2026-03-27

Run DocuMind as a Docker container instead of installing Node.js, PM2, and dependencies on your host machine. The container handles everything: database, scheduled scans, file watching, and the REST API on port 9000.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS/Windows) or Docker Engine (Linux)

- Docker Compose (included with Docker Desktop)

---

## Quick Start (Mount Mode)

Mount mode is the default. It reads your local repositories directly — no GitHub token needed.

### 1. Clone the repo

```bash

git clone https://github.com/DVWDesign/DocuMind.git
cd DocuMind

```

### 2. Create your `.env` file

```bash

cp .env.example .env

```

Edit `.env` and set your repos path:

```bash

REPOS_HOST_PATH=/path/to/your/repos

```

For example, on macOS with the DVWDesign layout:

```bash

REPOS_HOST_PATH=/Users/Shared/htdocs/github/DVWDesign

```

### 3. Build and start

```bash

docker compose up -d

```

This builds the image (first time takes 1-2 minutes) and starts the container in the background.

### 4. Verify it's running

```bash

docker compose ps

```

You should see the `documind` service with status `Up` and a health check of `healthy` (may take 30 seconds after first start).

### 5. Test the API

```bash

curl http://localhost:9000/health

```

Expected response:

```json

{"status":"ok","version":"2.0.0"}

```

---

## What the Container Does

Once running, DocuMind automatically:

| Schedule        | What happens                                  |

| --------------- | --------------------------------------------- |

| On startup      | Initializes the database and runs a full scan |

| Every 15 min    | Checks the file watcher is alive              |

| Every hour      | Incremental scan (only changed files)         |

| Daily at 2 AM   | Full scan + similarity detection              |

| Weekly (Sunday) | PDF re-index + keyword refresh                |

All data (the SQLite database, logs) is stored in a Docker volume (`documind_data`) that persists across container restarts.

---

## Using the API

The container exposes a REST API on port 9000 (configurable via `DOCUMIND_PORT` in `.env`).

### Search documents

```bash

curl "http://localhost:9000/search?q=migration"

```

### View statistics

```bash

curl http://localhost:9000/stats

```

### Trigger a manual scan

```bash

curl -X POST http://localhost:9000/scan

```

### Scan a specific repo

```bash

curl -X POST http://localhost:9000/scan -H "Content-Type: application/json" -d '{"repo":"DocuMind"}'

```

### View the document graph

```bash

curl http://localhost:9000/graph

```

### Browse folder trees

```bash

curl http://localhost:9000/tree/DocuMind

```

### Full endpoint list

| Endpoint      | Method | Description                 |

| ------------- | ------ | --------------------------- |

| `/health`     | GET    | Health check + version      |

| `/stats`      | GET    | Dashboard statistics        |

| `/search?q=`  | GET    | Full-text search            |

| `/graph`      | GET    | Document relationship graph |

| `/tree/:repo` | GET    | Folder hierarchy            |

| `/keywords`   | GET    | Keyword cloud data          |

| `/diagrams`   | GET    | Diagram registry            |

| `/scan`       | POST   | Trigger scan                |

| `/index`      | POST   | Reindex documents           |

| `/convert`    | POST   | Convert file (DOCX/RTF/PDF) |

---

## Common Operations

### View logs

```bash

docker compose logs -f documind

```

Press `Ctrl+C` to stop following.

### Restart the container

```bash

docker compose restart

```

### Stop the container

```bash

docker compose down

```

Your data volume is preserved. Next `docker compose up -d` picks up where it left off.

### Rebuild after code changes

```bash

docker compose up -d --build

```

### Reset everything (database + data)

```bash

docker compose down -v
docker compose up -d

```

The `-v` flag removes the data volume. The next startup creates a fresh database and runs a full scan.

---

## Clone Mode (Remote Servers)

Clone mode is for running DocuMind on a server that doesn't have the repositories on disk. The container clones them from GitHub on startup and pulls updates on schedule.

### 1. Create a GitHub personal access token

Go to [GitHub Settings > Tokens](https://github.com/settings/tokens) and create a token with `repo` scope (read access to your repositories).

### 2. Configure `.env`

```bash

REPO_MODE=clone
DOCUMIND_REPOS=DVWDesign/DocuMind,DVWDesign/RootDispatcher
GIT_TOKEN=ghp_your_token_here
DOCUMIND_REPOS_DIR=/app/repos

```

### 3. Edit `docker-compose.yml`

Two changes are needed:

#### a) Comment out the bind mount, uncomment the clone volume:

```yaml

volumes:

  - documind_data:/app/data

  # - ${REPOS_HOST_PATH:-/path}:/repos:ro        # comment this out

  - documind_repos:/app/repos                     # uncomment this

```

#### b) Uncomment the clone-mode environment variables:

```yaml

environment:
  REPO_MODE: "${REPO_MODE:-clone}"
  DOCUMIND_REPOS_DIR: "/app/repos"
  DOCUMIND_REPOS: "${DOCUMIND_REPOS}"
  GIT_TOKEN: "${GIT_TOKEN}"

```

#### c) Uncomment the `documind_repos` volume at the bottom:

```yaml

volumes:
  documind_data:
  documind_repos:

```

### 4. Start

```bash

docker compose up -d

```

The container clones each repository on first start. Subsequent restarts skip already-cloned repos. Every hour, it pulls the latest changes and re-scans any repos that were updated.

### Security note

`GIT_TOKEN` is injected at runtime from your `.env` file or host environment. It is **never** baked into the Docker image — you can safely share or publish the image without exposing credentials. Verify with:

```bash

docker history --no-trunc documind-documind | grep -i token

```

This should return no results.

---

## Changing the Port

By default DocuMind runs on port 9000. To change it:

```bash

# In .env

DOCUMIND_PORT=8080

```

Then restart:

```bash

docker compose up -d

```

The API is now at `http://localhost:8080`.

---

## Troubleshooting

### Container won't start

```bash

docker compose logs documind

```

Look for error messages. Common issues:

- **Port 9000 already in use** — change `DOCUMIND_PORT` in `.env`

- **Permission denied on /repos** — check that `REPOS_HOST_PATH` points to a readable directory

### Health check failing

The health check hits `http://localhost:9000/health` inside the container. If it keeps showing `unhealthy`:

```bash

# Check if the process is running

docker compose exec documind ps aux

# Test health endpoint from inside

docker compose exec documind curl -f http://localhost:9000/health

```

### Database errors after upgrade

If the schema has changed between versions:

```bash

docker compose down -v
docker compose up -d --build

```

This drops the old database and creates a fresh one. The first scan rebuilds all indexes.

### Clone mode: authentication failures

Verify your token works:

```bash

curl -H "Authorization: token ghp_your_token" https://api.github.com/user

```

If that fails, regenerate the token with `repo` scope.

### Container uses too much memory

DocuMind is lightweight (~150MB typical), but large scans can spike memory. Add a limit in `docker-compose.yml`:

```yaml

services:
  documind:
    deploy:
      resources:
        limits:
          memory: 512M

```

---

## Architecture Overview

```text

Host Machine                          Docker Container
=============                         ================

repos/  ──bind mount──►  /repos       (mount mode)
                                      OR
                          /app/repos   (clone mode, cloned from GitHub)
                              │
                              ▼
.env  ──env vars──►   daemon/server.mjs  ◄── port 9000
                              │
                              ▼
                       data/documind.db  ──► documind_data volume
                       (SQLite + FTS5)

```

The container runs as a non-root user (`documind`) with [dumb-init](https://github.com/Yelp/dumb-init) as PID 1 for proper signal handling. Repositories in mount mode are read-only (`:ro` flag).

---

## Publishing to GHCR

DocuMind images are published to `ghcr.io/design-dvw/documind`. Automated publishing happens via GitHub Actions on every semver version tag push, but manual publishing is also supported for first-time setup, testing, or environments without CI.

### Automated Publishing

Push a semver tag to trigger the workflow:

```bash

git tag v3.2.0
git push origin v3.2.0

```

The workflow (`.github/workflows/publish.yml`) builds a multi-arch image and pushes two tags to GHCR:

- `ghcr.io/design-dvw/documind:3.2.0` — the specific version

- `ghcr.io/design-dvw/documind:latest` — updated on every non-pre-release tag

Note: ARM64 builds compile `better-sqlite3` from source under QEMU emulation on GitHub-hosted runners. This can take 15-40 minutes. The workflow has a 60-minute timeout.

### Manual Publishing

Use these steps to build and push without GitHub Actions.

#### Step 1: Create a GitHub PAT

Go to [github.com/settings/tokens](https://github.com/settings/tokens) and create a token with `write:packages` scope.

#### Step 2: Authenticate with GHCR

```bash

export CR_PAT=ghp_your_token_here
echo $CR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

```

#### Step 3: Build and push the multi-arch image

```bash

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/design-dvw/documind:VERSION \
  --tag ghcr.io/design-dvw/documind:latest \
  --push \
  .

```

Replace `VERSION` with the release version (e.g., `v3.2.0`).

#### Step 4: Verify the published image

```bash

docker buildx imagetools inspect ghcr.io/design-dvw/documind:VERSION

```

This shows the manifest list with both `linux/amd64` and `linux/arm64` entries.

### Pulling the Image

Pull the latest published image:

```bash

docker pull ghcr.io/design-dvw/documind:latest

```

Run it directly:

```bash

docker run -d -p 9000:9000 ghcr.io/design-dvw/documind:latest

```

For full usage with persistent data, volume mounts, and environment configuration, use `docker-compose.yml` as described in the [Quick Start](#quick-start-mount-mode) section above.
