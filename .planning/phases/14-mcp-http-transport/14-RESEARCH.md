# Phase 14: MCP HTTP Transport - Research

**Researched:** 2026-03-28
**Domain:** MCP SDK StreamableHTTPServerTransport, Express middleware, bearer token auth
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Bearer token sourced from `DOCUMIND_MCP_TOKEN` env var
- Support comma-separated list of tokens (e.g., `DOCUMIND_MCP_TOKEN=token1,token2`)
- If `DOCUMIND_MCP_TOKEN` is not set when HTTP mode starts, refuse to start with clear error message
- Log failed auth attempts with timestamp, IP/origin, and "auth failed" message
- Use standard MCP protocol error format (JSON-RPC errors from MCP spec)
- Enable configurable CORS via env var — future-proof for browser-based MCP clients
- Env var: `DOCUMIND_MCP_MODE` with values `stdio` | `http`
- Default to `stdio` when not set — local Claude Code keeps working without config changes
- In HTTP mode, both Express REST API (port 9000) and MCP HTTP endpoint are active
- Error on startup if `DOCUMIND_MCP_MODE` is set to an invalid value (not `stdio` or `http`)
- TLS termination handled upstream (reverse proxy) — DocuMind serves plain HTTP
- Update `docker-compose.yml` to expose MCP HTTP port and add MCP env vars
- `/health` endpoint includes `mcp_mode: stdio|http` field

### Claude's Discretion

- Transport implementation choice (StreamableHTTPServerTransport vs custom REST wrapper)
- Whether MCP HTTP runs on same port 9000 or separate port
- CORS env var naming and default origins
- Internal MCP handler architecture

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MCPT-01 | MCP HTTP endpoint on POST /mcp using StreamableHTTPServerTransport | SDK class confirmed, Express integration pattern established |
| MCPT-02 | Bearer token auth protects MCP HTTP endpoint | Custom `OAuthTokenVerifier` pattern or manual Express middleware; `requireBearerAuth` from SDK requires `expiresAt` — not suitable for static tokens |
| MCPT-03 | MCP stdio mode continues to work for local Claude Code | Existing `StdioServerTransport` path unchanged; mode switch via env var |
| MCPT-04 | MCP mode (stdio/http) selectable via env var | `DOCUMIND_MCP_MODE` env var read at startup in `mcp-server.mjs` |
</phase_requirements>

## Summary

The MCP TypeScript SDK v1.27.1 (already installed) ships `StreamableHTTPServerTransport` in `@modelcontextprotocol/sdk/server/streamableHttp.js`. The transport wraps Node.js `IncomingMessage`/`ServerResponse` via `@hono/node-server` and is designed to be mounted on an Express route via `transport.handleRequest(req, res, req.body)`. The transport handles the full MCP protocol over HTTP including session management (stateful or stateless), SSE streaming, and DELETE for session termination.

Bearer auth in the SDK (`requireBearerAuth`) is designed for OAuth flows and **requires** `expiresAt` to be present on the token — it rejects tokens without expiry. Static API tokens do not have `expiresAt`, so the SDK middleware cannot be used as-is. The correct approach is a **hand-written Express middleware** that extracts the `Authorization: Bearer` header, compares against the token list from `DOCUMIND_MCP_TOKEN`, and returns a `401` JSON-RPC error response on failure. This is simpler and fits the single-server use case.

The existing `mcp-server.mjs` already uses `StdioServerTransport`. This phase extends it to branch on `DOCUMIND_MCP_MODE`: if `stdio` (default), existing path runs unchanged; if `http`, the Express app from `server.mjs` is imported and the `/mcp` route is added with the `StreamableHTTPServerTransport`. Both can coexist on port 9000 since Express routes are additive.

**Primary recommendation:** Use `StreamableHTTPServerTransport` in stateless mode (no session ID), mount on the existing Express app at `POST /mcp` and `GET /mcp`, with a hand-written auth middleware that checks tokens from `DOCUMIND_MCP_TOKEN`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | `^1.27.1` (already installed) | `StreamableHTTPServerTransport`, `McpServer` | Official MCP SDK — no new dep needed |
| `express` | `^5.2.1` (already installed) | HTTP routing, middleware | Already used for port 9000 REST API |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cors` npm package | — | CORS headers | NOT needed — CORS is 4 lines of Express middleware; adding a dep is overkill here |
| `crypto` (Node built-in) | built-in | `randomUUID()` for stateful session IDs | Only if stateful mode is chosen |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `StreamableHTTPServerTransport` | Custom JSON-RPC REST wrapper | Would require reimplementing MCP protocol framing — always worse |
| Hand-written bearer middleware | SDK `requireBearerAuth` | SDK requires OAuth-style `expiresAt` on tokens — unusable for static tokens without workarounds |
| Same port 9000 | Separate MCP port | Same port is simpler: one listener, one Docker port mapping, existing Express app extended |

**Installation:** No new packages required — SDK and Express already installed.

## Architecture Patterns

### Recommended Project Structure

```text
daemon/
├── mcp-server.mjs        # MODIFIED: mode-switching logic (stdio vs http)
├── server.mjs            # MODIFIED: exports app + httpServer for MCP HTTP to reuse
config/
└── env.mjs               # MODIFIED: add MCP_MODE, MCP_TOKEN, MCP_CORS_ORIGINS
docker-compose.yml        # MODIFIED: add DOCUMIND_MCP_MODE, DOCUMIND_MCP_TOKEN envs
```

### Pattern 1: Mode-Switching Entry Point

**What:** `mcp-server.mjs` reads `DOCUMIND_MCP_MODE` at the top and branches into two paths — stdio (existing) or HTTP (new).

**When to use:** Phase decision requires default-stdio behavior with opt-in HTTP.

```javascript
// Source: CONTEXT.md locked decisions + SDK docs
import { MCP_MODE, MCP_TOKEN } from '../config/env.mjs';

if (MCP_MODE === 'stdio') {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else if (MCP_MODE === 'http') {
  if (!MCP_TOKEN) {
    console.error('[MCP] DOCUMIND_MCP_TOKEN is required in HTTP mode. Exiting.');
    process.exit(1);
  }
  await startHttpMode(server);
} else {
  console.error(`[MCP] Invalid DOCUMIND_MCP_MODE "${MCP_MODE}". Must be "stdio" or "http". Exiting.`);
  process.exit(1);
}
```

### Pattern 2: Mounting StreamableHTTPServerTransport on Existing Express App

**What:** The existing Express app (`server.mjs`) is reused — `/mcp` route added with auth middleware wrapping `transport.handleRequest`.

**When to use:** HTTP mode; same-port design for Docker simplicity.

```javascript
// Source: SDK streamableHttp.d.ts + docs/server.md pattern
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // stateless — no session tracking needed
});
await server.connect(transport);

// Mount on existing Express app (imported from server.mjs)
app.post('/mcp', bearerAuthMiddleware, async (req, res) => {
  await transport.handleRequest(req, res, req.body);
});
app.get('/mcp', bearerAuthMiddleware, async (req, res) => {
  await transport.handleRequest(req, res);
});
app.delete('/mcp', bearerAuthMiddleware, async (req, res) => {
  await transport.handleRequest(req, res);
});
```

Note: `GET /mcp` enables SSE stream for server-to-client notifications. `DELETE /mcp` enables session termination (required by spec even in stateless mode for completeness).

### Pattern 3: Hand-Written Static Bearer Token Middleware

**What:** Express middleware that parses `Authorization: Bearer <token>`, validates against the token list, and returns `401` on failure.

**Why not SDK `requireBearerAuth`:** The SDK middleware calls `verifier.verifyAccessToken(token)` and rejects tokens without `expiresAt` field, throwing `InvalidTokenError: 'Token has no expiration time'`. Static tokens have no expiry concept.

```javascript
// Source: Derived from SDK bearerAuth.js implementation pattern, adapted for static tokens
const VALID_TOKENS = new Set(
  (process.env.DOCUMIND_MCP_TOKEN ?? '').split(',').map(t => t.trim()).filter(Boolean)
);

function bearerAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const ip = req.ip || req.socket?.remoteAddress;
    console.error(`[MCP] Auth failed: missing token | ${new Date().toISOString()} | ${ip} | ${req.headers.origin ?? ''}`);
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    });
  }
  const token = authHeader.slice(7).trim();
  if (!VALID_TOKENS.has(token)) {
    const ip = req.ip || req.socket?.remoteAddress;
    console.error(`[MCP] Auth failed: invalid token | ${new Date().toISOString()} | ${ip} | ${req.headers.origin ?? ''}`);
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    });
  }
  next();
}
```

### Pattern 4: Exporting Express App from server.mjs

**What:** `server.mjs` currently starts its own server internally. For HTTP MCP mode, `mcp-server.mjs` needs to add routes to the same Express app. The existing STATE.md note confirms this was anticipated: `"server exported from server.mjs for downstream MCP HTTP transport use in later phases"`.

Check whether `server.mjs` already exports `app` and the `httpServer` instance. If not, add `export { app, httpServer }` before the listen call.

### Pattern 5: CORS for Browser-Based MCP Clients

**What:** Manual CORS middleware on the `/mcp` route (not global), controlled by `DOCUMIND_MCP_CORS_ORIGINS` env var.

```javascript
// Source: Standard Express CORS pattern
const CORS_ORIGINS = process.env.DOCUMIND_MCP_CORS_ORIGINS
  ? process.env.DOCUMIND_MCP_CORS_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use('/mcp', (req, res, next) => {
  const origin = req.headers.origin;
  if (CORS_ORIGINS.length === 0 || !origin) return next();
  if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
```

### Pattern 6: Health Endpoint Update

**What:** Add `mcp_mode` field to the existing `/health` response.

```javascript
// In server.mjs health route
import { MCP_MODE } from '../config/env.mjs';

res.json({
  status: 'ok',
  version: '2.0.0',
  uptime: process.uptime(),
  mcp_mode: MCP_MODE,  // 'stdio' or 'http'
});
```

### Anti-Patterns to Avoid

- **Starting MCP HTTP on a separate port:** Creates two listeners, complicates Docker port mapping, and splits the API surface. Use the existing Express app on port 9000.
- **Using SDK `requireBearerAuth` with static tokens:** The middleware enforces `expiresAt` — tokens without it will always be rejected. Write your own middleware.
- **Using SSE-only transport (deprecated):** REQUIREMENTS.md explicitly notes "SSE MCP transport — Deprecated by MCP spec 2025-03-26; use Streamable HTTP only."
- **Stateful sessions for this use case:** Adds in-memory session state and complexity. The 14 DocuMind tools are all synchronous DB/file operations — stateless mode is correct.
- **Binding auth check at server startup:** `VALID_TOKENS` set should be built once at startup, not per-request. Pre-compute from env var.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol framing (JSON-RPC over HTTP, SSE streaming, session headers) | Custom REST-to-MCP adapter | `StreamableHTTPServerTransport.handleRequest()` | Handles POST/GET/DELETE, SSE vs JSON response negotiation, `Mcp-Session-Id`, `MCP-Protocol-Version` header validation |
| HTTP server for MCP | New Express app | Extend existing Express app in `server.mjs` | STATE.md already notes server was exported for this purpose |

**Key insight:** The transport does all protocol work. The only custom code needed is the auth middleware and the mode switch.

## Common Pitfalls

### Pitfall 1: SDK `requireBearerAuth` Rejects Static Tokens

**What goes wrong:** `requireBearerAuth` calls `verifyAccessToken(token)` and then checks `typeof authInfo.expiresAt !== 'number'` — throws `InvalidTokenError: 'Token has no expiration time'` for any token that doesn't set `expiresAt`. Static API tokens don't expire.

**Why it happens:** The SDK bearer middleware is built for OAuth 2.0 access tokens, not static API keys.

**How to avoid:** Implement a custom Express middleware (Pattern 3 above) that does a plain `Set.has(token)` lookup. Return 401 with JSON-RPC error format.

**Warning signs:** `401 - Token has no expiration time` in logs.

### Pitfall 2: Missing GET /mcp Handler Breaks SSE

**What goes wrong:** MCP spec requires `GET /mcp` for server-initiated SSE. If only `POST /mcp` is mounted, clients that open a standalone SSE connection get `404`.

**Why it happens:** Developers assume MCP is POST-only.

**How to avoid:** Mount `app.get('/mcp', ...)` and `app.delete('/mcp', ...)` alongside `app.post('/mcp', ...)`.

**Warning signs:** Client errors on initialization with SSE-capable clients.

### Pitfall 3: `req.body` Already Parsed by Express

**What goes wrong:** If `express.json()` middleware runs globally (it does in `server.mjs`), `req.body` is already parsed. `transport.handleRequest(req, res)` without the third argument causes the transport to re-parse the body, which fails because the stream is already consumed.

**Why it happens:** Transport supports both pre-parsed and raw body. The third arg `parsedBody` must be passed.

**How to avoid:** Always call `transport.handleRequest(req, res, req.body)` for POST — pass `req.body` as the third argument.

### Pitfall 4: McpServer Instance Shared Between Modes

**What goes wrong:** A single `McpServer` instance can only be connected to one transport. If startup attempts to connect it to both `StdioServerTransport` and `StreamableHTTPServerTransport`, the second `connect()` will fail.

**Why it happens:** The mode-switching branch must be exclusive — never call `server.connect()` twice.

**How to avoid:** The `if/else` mode branch ensures only one `connect()` runs.

### Pitfall 5: Token List Empty String After Split

**What goes wrong:** If `DOCUMIND_MCP_TOKEN=` (set but empty), `split(',').map(t => t.trim())` produces `['']`, which adds empty string to the valid set — any request with `Authorization: Bearer ` (empty token) would pass.

**Why it happens:** `.split(',')` on empty string returns `['']`.

**How to avoid:** Filter after trim: `.filter(Boolean)`. Already shown in Pattern 3.

### Pitfall 6: stdout Pollution in HTTP Mode

**What goes wrong:** In stdio mode, `mcp-server.mjs` redirects `console.log` to stderr to keep stdout clean for JSON-RPC. In HTTP mode, stdout is not the transport wire — but the redirect is still in place. This is harmless but potentially confusing.

**Why it happens:** The stdout redirect is at the top of the file, before mode detection.

**How to avoid:** The redirect can stay — it doesn't break HTTP mode. Document it in a comment.

## Code Examples

Verified patterns from official sources:

### Full HTTP Mode Startup Sequence

```javascript
// Source: SDK streamableHttp.d.ts, docs/server.md patterns, STATE.md server export note
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// server is already constructed with all 14 tools registered

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // stateless
});

// Connect MCP server to HTTP transport
await server.connect(transport);

// Add /mcp routes to the existing Express app (imported from server.mjs)
app.use('/mcp', corsMiddleware);          // CORS before auth
app.post('/mcp', bearerAuthMiddleware, async (req, res) => {
  await transport.handleRequest(req, res, req.body);
});
app.get('/mcp', bearerAuthMiddleware, async (req, res) => {
  await transport.handleRequest(req, res);
});
app.delete('/mcp', bearerAuthMiddleware, async (req, res) => {
  await transport.handleRequest(req, res);
});
```

### Env Vars to Add to env.mjs

```javascript
// Source: CONTEXT.md locked decisions
export const MCP_MODE = process.env.DOCUMIND_MCP_MODE ?? 'stdio';
export const MCP_TOKEN = process.env.DOCUMIND_MCP_TOKEN ?? null;
export const MCP_CORS_ORIGINS = process.env.DOCUMIND_MCP_CORS_ORIGINS ?? '';
```

### Docker-Compose Additions

```yaml
# Source: CONTEXT.md — "Update docker-compose.yml to expose MCP HTTP port and add MCP env vars"
environment:
  DOCUMIND_MCP_MODE: "${DOCUMIND_MCP_MODE:-stdio}"
  # Required when DOCUMIND_MCP_MODE=http:
  # DOCUMIND_MCP_TOKEN: "${DOCUMIND_MCP_TOKEN}"
  # Optional CORS origins (comma-separated):
  # DOCUMIND_MCP_CORS_ORIGINS: "${DOCUMIND_MCP_CORS_ORIGINS:-}"
```

No additional port exposure is needed — MCP HTTP runs on existing port 9000.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP+SSE transport (separate GET /sse + POST /messages endpoints) | Streamable HTTP (single `/mcp` endpoint, POST+GET+DELETE) | MCP spec 2025-03-26 | REQUIREMENTS.md explicitly forbids SSE transport |
| Full OAuth 2.0 with `requireBearerAuth` | Custom static token verifier for API-key use cases | Always — SDK auth was designed for OAuth | Static bearer tokens are the right fit for server-to-server use |

**Deprecated/outdated:**

- SSE transport (`StdioServerTransport` is fine; `SSEServerTransport` is the deprecated HTTP transport — do not use)
- `requireBearerAuth` from SDK for static tokens — requires `expiresAt`, inappropriate for API keys

## Open Questions

1. **Does `server.mjs` already export `app`?**
   - What we know: STATE.md note says `"server exported from server.mjs for downstream MCP HTTP transport use in later phases"` — implies the export was anticipated
   - What's unclear: Whether the export was actually added during earlier phases or just noted as a decision
   - Recommendation: Planner should include a task to verify and add `export { app }` if missing

2. **Stateless vs stateful session mode**
   - What we know: Stateless (no `sessionIdGenerator`) skips all session validation; stateful generates `Mcp-Session-Id` headers and tracks state in-memory
   - What's unclear: Whether remote Claude Code agents expect session IDs (they should tolerate either)
   - Recommendation: Use stateless — simpler, no in-memory accumulation across requests, correct for the DocuMind use case where tools are all synchronous operations

3. **Same port vs separate MCP port**
   - What we know: User left this to Claude's discretion; existing Express app is on 9000
   - Recommendation: Same port 9000. Avoids a second listener, a second Docker port mapping, and a second URL to configure. The `/mcp` path is unambiguous.

## Sources

### Primary (HIGH confidence)

- Installed SDK `/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/streamableHttp.d.ts` — class signature, constructor options, `handleRequest` method
- Installed SDK `/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/auth/middleware/bearerAuth.js` — `requireBearerAuth` source, `expiresAt` enforcement confirmed
- Installed SDK `/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/webStandardStreamableHttp.d.ts` — full `WebStandardStreamableHTTPServerTransportOptions` interface
- Installed SDK `/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/express.js` — `createMcpExpressApp` pattern
- `https://modelcontextprotocol.io/docs/concepts/transports` — Streamable HTTP spec: POST/GET/DELETE, session headers, backwards compat
- `https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md` — stateless Express pattern with `handleRequest(req, res, req.body)`

### Secondary (MEDIUM confidence)

- STATE.md `"server exported from server.mjs for downstream MCP HTTP transport use in later phases"` — project-specific architectural intent
- REQUIREMENTS.md `"SSE MCP transport — Deprecated by MCP spec 2025-03-26; use Streamable HTTP only"` — confirms transport choice

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — SDK already installed, APIs verified from local node_modules
- Architecture: HIGH — implementation pattern derived directly from SDK source code
- Pitfalls: HIGH — `requireBearerAuth` limitation verified from source; others derived from SDK internals

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (SDK v1.x stable, MCP spec 2025-03-26 current)
