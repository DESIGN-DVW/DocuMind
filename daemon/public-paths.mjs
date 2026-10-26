/**
 * Which requests bypass bearer auth.
 *
 * Kept in its own module so the rule is testable without booting the daemon —
 * importing server.mjs starts a scheduler and watcher against the live DB.
 */

/** Express may report loopback as IPv4, IPv6, or IPv4-mapped IPv6. */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Read endpoints the browser dashboards populate from.
 * Exact paths only, so /obsolete/:id and /diagrams/relink never match.
 */
const DASHBOARD_READ_PATHS = new Set(['/diagrams', '/obsolete']);

export const isLoopback = ip => LOOPBACK.has(ip);

/**
 * The dashboards are static HTML with nowhere to hold a token, so gating their
 * read endpoints left them loading as empty shells. GET from loopback is
 * exempt; every mutation (relink, archive, delete, batch-archive, /hook) is
 * POST or DELETE and stays gated.
 *
 * @param {{ method: string, path: string, ip: string }} req
 */
export const isDashboardRead = req =>
  req.method === 'GET' && DASHBOARD_READ_PATHS.has(req.path) && isLoopback(req.ip);

/**
 * @param {{ method: string, path: string, ip: string }} req
 * @returns {boolean} true when the request may skip authentication
 */
export const isPublicPath = req =>
  req.path === '/health' || req.path.startsWith('/dashboard') || isDashboardRead(req);
