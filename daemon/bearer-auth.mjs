/**
 * Shared bearer-token authentication for DocuMind's HTTP surfaces.
 *
 * Extracted from daemon/mcp-server.mjs so the MCP endpoint and the daemon REST
 * API enforce identical rules rather than drifting apart — the daemon shipped
 * with no gate at all while /mcp was protected, which is exactly the divergence
 * a single implementation prevents.
 */

/**
 * Parse a comma-separated token string into a validated Set.
 * Exits the process when the surface requires a token and none is usable —
 * failing closed, so a misconfigured deployment never silently runs open.
 *
 * @param {string|null} raw    Comma-separated tokens (typically from env).
 * @param {string} label       Log prefix, e.g. 'MCP' or 'API'.
 * @param {string} envName     Env var name, for the operator-facing error.
 * @returns {Set<string>}
 */
export function parseTokens(raw, label, envName) {
  if (!raw) {
    console.error(`[${label}] ${envName} is required. Exiting.`);
    process.exit(1);
  }
  const tokens = new Set(
    raw
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
  );
  if (tokens.size === 0) {
    console.error(`[${label}] ${envName} is set but contains no valid tokens. Exiting.`);
    process.exit(1);
  }
  return tokens;
}

/**
 * Build bearer-auth middleware.
 *
 * @param {object}  opts
 * @param {Set<string>} opts.tokens  Accepted tokens.
 * @param {string}  opts.label       Log prefix.
 * @param {boolean} [opts.jsonRpc]   Emit a JSON-RPC error body (MCP) instead of plain JSON.
 * @param {(req:object)=>boolean} [opts.skip]  Return true to bypass (e.g. public health).
 */
export function createBearerAuth({ tokens, label, jsonRpc = false, skip }) {
  const deny = res =>
    jsonRpc
      ? res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized' },
          id: null,
        })
      : res.status(401).json({ error: 'Unauthorized' });

  return function bearerAuth(req, res, next) {
    if (skip?.(req)) return next();

    const ip = req.ip || req.socket?.remoteAddress;
    const origin = req.headers.origin ?? '';
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Never log the supplied value — only that a token was missing.
      console.error(
        `[${label}] Auth failed: missing token | ${new Date().toISOString()} | ${ip} | ${origin}`
      );
      return deny(res);
    }
    if (!tokens.has(authHeader.slice(7).trim())) {
      console.error(
        `[${label}] Auth failed: invalid token | ${new Date().toISOString()} | ${ip} | ${origin}`
      );
      return deny(res);
    }
    next();
  };
}
