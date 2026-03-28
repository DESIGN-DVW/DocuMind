# Phase 14: MCP HTTP Transport - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose existing MCP tools over HTTP from remote consumers, protected by bearer auth. Stdio mode continues to work for local Claude Code. Mode is switchable via env var. This phase does NOT add new MCP tools — it adds a transport layer for the existing 14 tools.

</domain>

<decisions>
## Implementation Decisions

### Auth & token design
- Bearer token sourced from `DOCUMIND_MCP_TOKEN` env var
- Support comma-separated list of tokens for multiple consumers (e.g., `DOCUMIND_MCP_TOKEN=token1,token2`)
- If `DOCUMIND_MCP_TOKEN` is not set when HTTP mode starts, refuse to start with clear error message
- Log failed auth attempts with timestamp, IP/origin, and "auth failed" message

### HTTP endpoint behavior
- Use standard MCP protocol error format (JSON-RPC errors from MCP spec)
- Enable configurable CORS via env var — consumers are primarily server-side but future-proof for browser-based MCP clients

### Mode switching
- Env var: `DOCUMIND_MCP_MODE` with values `stdio` | `http`
- Default to `stdio` when not set — local Claude Code keeps working without config changes
- In HTTP mode, both Express REST API (port 9000) and MCP HTTP endpoint are active
- Error on startup if `DOCUMIND_MCP_MODE` is set to an invalid value (not `stdio` or `http`)

### Deployment context
- Primary consumers: Docker-internal services AND remote Claude Code agents
- TLS termination handled upstream (reverse proxy) — DocuMind serves plain HTTP
- Update `docker-compose.yml` to expose MCP HTTP port and add MCP env vars
- `/health` endpoint includes `mcp_mode: stdio|http` field

### Claude's Discretion
- Transport implementation choice (StreamableHTTPServerTransport vs custom REST wrapper)
- Whether MCP HTTP runs on same port 9000 or separate port
- CORS env var naming and default origins
- Internal MCP handler architecture

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for MCP HTTP transport implementation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-mcp-http-transport*
*Context gathered: 2026-03-28*
