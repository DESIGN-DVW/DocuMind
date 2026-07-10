---

description: Check and restart dev servers for the current repo only (scoped via --repo)

---

# /restart-servers

Check and restart PM2-managed services for the **current repo only**.

## Usage

User invokes: `/restart-servers`

## Steps

1. **Determine current repo path:**

```bash

echo "$PWD"

```

1. **Run scoped health check with restart:**

```bash

node /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/scripts/check-servers.mjs --restart --repo "$PWD"

```

This checks only the PM2 services whose `cwd` in `ecosystem.config.cjs` matches the current repo.
Services belonging to other repos are **not touched**.

1. **If a service fails to restart**, check its logs:

```bash

pm2 logs {service-name} --lines 50

```

## Repo Has No PM2 Services?

If the output says "No PM2 services registered for repo", the current repo has no PM2-managed
processes. Services like Vite dev servers started manually are not managed by PM2. Start them
normally with `npm run dev`.

## See All Ecosystem Services

To check the full ecosystem status (not scoped):

```bash

node /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/scripts/check-servers.mjs

```

## Bootstrap PM2 (if pm2 list shows nothing)

```bash

pm2 startOrRestart /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/config/ecosystem.config.cjs --silent

```
