# Stage 1 — builder: compile native modules on Linux
# Pin to native build platform so npm ci (better-sqlite3) runs natively, not under QEMU emulation
ARG BUILDPLATFORM
FROM --platform=${BUILDPLATFORM:-linux/amd64} node:22-bookworm-slim AS builder

WORKDIR /app

# Install build tools required for native modules (better-sqlite3 uses node-gyp)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package manifests and npm config first for layer cache
COPY package*.json .npmrc* ./

# Full install to compile native modules with Linux toolchain
RUN npm ci

# Remove dev dependencies to reduce image size (~50-80MB savings)
RUN npm prune --omit=dev

# Copy application code (.dockerignore prevents node_modules from host)
COPY . .

# Stage 2 — runtime: minimal image with only what the daemon needs
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Install dumb-init (PID 1 signal forwarding), curl (for HEALTHCHECK), and git (for clone mode)
RUN apt-get update && apt-get install -y dumb-init curl git && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r documind && useradd -r -g documind -d /app documind

# Create data directory owned by documind (named volume will mount here)
RUN mkdir -p /app/data && chown documind:documind /app/data

# Create repos directory owned by documind (used by clone mode to store cloned repos)
RUN mkdir -p /app/repos && chown documind:documind /app/repos

# Copy production node_modules from builder (Linux-compiled binaries)
COPY --from=builder /app/node_modules ./node_modules

# Copy application code with correct ownership
COPY --chown=documind:documind . .

# Safety: remove any stray DB files or secrets that slipped through .dockerignore
RUN rm -f data/documind.db data/*.db-wal data/*.db-shm .env

# Run as non-root
USER documind

EXPOSE 9000

# Healthcheck — /health endpoint returns 200 when daemon is ready
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:9000/health || exit 1

# dumb-init as PID 1 ensures SIGTERM propagates to node (avoids 10s Docker stop timeout)
ENTRYPOINT ["dumb-init", "--"]

# Run node directly — NOT npm start (npm swallows SIGTERM)
CMD ["node", "daemon/server.mjs"]
