/**
 * Centralized environment configuration for DocuMind
 *
 * This is the single source of truth for all runtime configuration.
 * It loads .env via Node 22's built-in process.loadEnvFile() and
 * exports all config as named constants with sensible defaults.
 *
 * IMPORTANT: This module must NOT import from config/constants.mjs
 * to avoid circular dependencies.
 *
 * @module config/env
 */

import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// PROJECT ROOT
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the DocuMind project root
 * @constant {string}
 */
export const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// LOAD .ENV FILE
// ============================================================================

// Load .env if it exists. Silent skip if missing — Docker passes vars directly.
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // .env not present — this is fine in Docker and CI environments
}

// ============================================================================
// SERVER
// ============================================================================

/**
 * HTTP server port
 * @constant {number}
 */
export const PORT = Number(process.env.PORT ?? 9000);

// ============================================================================
// DATABASE
// ============================================================================

/**
 * Absolute path to the SQLite database file
 * @constant {string}
 */
export const DB_PATH = path.resolve(ROOT, process.env.DOCUMIND_DB ?? 'data/documind.db');

// ============================================================================
// PROFILE
// ============================================================================

/**
 * Absolute path to the active repository profile JSON
 * @constant {string}
 */
export const PROFILE_PATH = path.resolve(
  ROOT,
  process.env.DOCUMIND_PROFILE ?? 'config/profiles/dvwdesign.json'
);

// ============================================================================
// REPOSITORY DISCOVERY
// ============================================================================

/**
 * Base directory containing all repositories to scan.
 * When set, DocuMind discovers repos by walking this directory.
 * When null, the profile/registry defines which repos to scan.
 * @constant {string|null}
 */
export const REPOS_DIR = process.env.DOCUMIND_REPOS_DIR
  ? path.resolve(process.env.DOCUMIND_REPOS_DIR)
  : null;

/**
 * Explicit list of repository names to scan (comma-separated in env).
 * When set, only these repos are scanned regardless of REPOS_DIR.
 * When null, all repos discovered via REPOS_DIR or profile are used.
 * @constant {string[]|null}
 */
export const REPOS_LIST = process.env.DOCUMIND_REPOS
  ? process.env.DOCUMIND_REPOS.split(',')
      .map(s => s.trim())
      .filter(Boolean)
  : null;

/**
 * Repository ingestion mode.
 * 'mount' — repos are provided via host bind mount (default, macOS dev).
 * 'clone' — repos are cloned from GitHub on startup (Docker production).
 * @constant {string}
 */
export const REPO_MODE = process.env.REPO_MODE ?? 'mount';

// ============================================================================
// CRON SCHEDULES
// ============================================================================

/**
 * Cron expression for file watcher heartbeat check (default: every 15 min)
 * @constant {string}
 */
export const CRON_HEARTBEAT = process.env.DOCUMIND_CRON_HEARTBEAT ?? '*/15 * * * *';

/**
 * Cron expression for incremental scan (default: every hour)
 * @constant {string}
 */
export const CRON_HOURLY = process.env.DOCUMIND_CRON_HOURLY ?? '0 * * * *';

/**
 * Cron expression for full scan + analysis (default: daily at 2 AM)
 * @constant {string}
 */
export const CRON_DAILY = process.env.DOCUMIND_CRON_DAILY ?? '0 2 * * *';

/**
 * Cron expression for PDF re-index + keyword refresh (default: weekly Sunday 3 AM)
 * @constant {string}
 */
export const CRON_WEEKLY = process.env.DOCUMIND_CRON_WEEKLY ?? '0 3 * * 0';

/**
 * Cron expression for relink processor check (default: every 6 hours)
 * @constant {string}
 */
export const CRON_RELINK = process.env.DOCUMIND_CRON_RELINK ?? '0 */6 * * *';

// ============================================================================
// MCP TRANSPORT
// ============================================================================

/**
 * MCP transport mode.
 * 'stdio' — JSON-RPC over stdin/stdout for local Claude Code (default).
 * 'http'  — Streamable HTTP on Express /mcp route for remote consumers.
 * @constant {string}
 */
export const MCP_MODE = process.env.DOCUMIND_MCP_MODE ?? 'stdio';

/**
 * Bearer token(s) for MCP HTTP auth (comma-separated for multiple consumers).
 * Required when MCP_MODE is 'http'. Null when unset.
 * @constant {string|null}
 */
export const MCP_TOKEN = process.env.DOCUMIND_MCP_TOKEN ?? null;

/**
 * Allowed CORS origins for MCP HTTP endpoint (comma-separated).
 * Empty string disables CORS headers. Use '*' to allow all origins.
 * @constant {string}
 */
export const MCP_CORS_ORIGINS = process.env.DOCUMIND_MCP_CORS_ORIGINS ?? '';
