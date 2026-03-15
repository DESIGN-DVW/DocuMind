# Coding Conventions

**Analysis Date:** 2026-03-15

## Naming Patterns

**Files:**

- `.mjs` extension for ES modules (import/export syntax)
- Scripts use kebab-case: `fix-markdown.mjs`, `scan-all-repos.mjs`, `detect-deviations.mjs`
- Processor files: `markdown-processor.mjs`, `pdf-processor.mjs`, `keyword-processor.mjs`
- Database/graph logic: `relations.mjs`, `query-utils.mjs`

**Functions:**

- camelCase for function names: `processMarkdown()`, `findMarkdownFiles()`, `searchDocuments()`
- Async functions prefixed or clearly documented: `async function scanRepository()`
- Export functions with JSDoc comments
- Helper/utility functions lowercase: `detectLanguage()`, `getDatabase()`, `isActiveRepository()`

**Variables:**

- camelCase for most variables: `contentHash`, `frontmatter`, `fileData`, `docMap`
- Constants in UPPER_CASE: `BASE_PATH`, `GITHUB_ORG`, `EXCLUDE_PATTERNS`, `ACTIVE_REPOSITORIES`
- Configuration objects: `CONFIG` (uppercase), with camelCase properties: `CONFIG.basePath`, `CONFIG.defaultLanguage`
- Abbreviations acceptable: `db` for database, `repo` for repository, `fts` for full-text search

**Types:**

- No TypeScript; relies on JSDoc type annotations: `@param {string}`, `@param {import('better-sqlite3').Database}`
- Type hints in JSDoc: `{Array}`, `{object}`, `{Map<string, string>}`, `{Promise<...>}`
- Optional parameters marked with `[param]`: `@param {object} [options]`

## Code Style

**Formatting:**

- Prettier configuration: `.prettierrc.json`
- Tab width: 2 spaces
- Print width: 100 characters
- Trailing comma: ES5 (exclude in function params)
- Quotes: Single quotes (`'string'`)
- Arrow function parens: Avoid (omit when single param): `repo => repo.name`, not `(repo) => repo.name`
- Semicolons: Always present
- Line endings: LF

**Linting:**

- Markdown linting: `markdownlint-cli2` via `.markdownlint.json`
- No ESLint configuration found; Prettier handles JS/JSON formatting
- Pre-commit hook via Husky with lint-staged:
  - Markdown files: `markdownlint-cli2 --fix`
  - JS/JSON files: `prettier --write`

## Import Organization

**Order:**

1. Node.js built-ins (`path`, `fs/promises`, `crypto`)
2. Third-party packages (`express`, `better-sqlite3`, `chalk`, `gray-matter`)
3. Local modules (relative imports from same project)
4. Destructuring ordered alphabetically or by usage

**Examples:**

```javascript
import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { initScheduler } from './scheduler.mjs';
import { processHook } from './hooks.mjs';
```

**Path Aliases:**

- No path aliases detected; uses relative paths (`../`, `./`)
- Root path captured via `fileURLToPath(import.meta.url)` and `path.dirname()`

## Error Handling

**Patterns:**

- Try-catch blocks wrap file I/O and async operations
- Database operations often wrapped in transactions via `db.transaction(() => {...})`
- Early returns with null checks: `if (!row) return null;`
- HTTP API errors use status codes: `res.status(400).json({ error: '...' })`
- Errors logged to console: `console.error('[context] message:', err.message)`
- No error boundaries; exceptions propagate up or logged

**Examples:**

```javascript
try {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
} catch (error) {
  if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
    console.error(`Error reading ${currentPath}:`, error.message);
  }
}
```

**Database:**

- SQLite pragma enforcement: `db.pragma('foreign_keys = ON')`
- Insert with `ON CONFLICT`: UPSERTs instead of separate update
- Transaction batches for performance: `db.transaction(...)`.run()

## Logging

**Framework:** `console` (no dedicated logging library)

**Patterns:**

- Log levels: `console.log()`, `console.error()`, `console.warn()`
- Contextual prefixes in brackets: `[scheduler]`, `[graph]`, `[hook]`, `[relink]`
- Info/progress messages: `console.log('[daemon] listening on port 9000')`
- Error details: `console.error('[scheduler] error:', err.message)`
- Emoji indicators for CLI scripts (from scripts, not core logic):
  - `✅` success, `⚠️` warning, `❌` error, `📁` repo, `🔧` fix
  - Example: `console.log('✅ Fixed ${fixedCount} files')`

## Comments

**When to Comment:**

- Complex algorithms (relationship detection, TF-IDF scoring)
- Non-obvious regex patterns
- Database schema documentation (done via SQL schema files)
- Temporary TODOs for incomplete features

**JSDoc/TSDoc:**

- All exported functions have JSDoc comments
- Parameters: `@param {type} name - Description`
- Return values: `@returns {type} Description`
- Async functions: `@returns {Promise<type>}`
- Examples:

```javascript
/**
 * Process a single markdown file: parse, validate, and prepare for indexing
 * @param {string} filePath - Path to markdown file
 * @returns {Promise<{content: string, frontmatter: object, metadata: object}>}
 */
export async function processMarkdown(filePath) { ... }
```

**JSDoc Generation:**

- Config: `jsdoc.config.json`
- Template: docdash (static, searchable)
- Command: `npm run docs:jsdoc`
- Output: `./docs/07-api/jsdoc/`

## Function Design

**Size:**

- Typically 20-80 lines per function
- Longer functions exist for scanning/processing loops
- Helper functions extracted for reusability: `detectLanguage()`, `findPreviousHeading()`

**Parameters:**

- Named parameters preferred over positional
- Options object pattern: `function search(query, options = { repository, category, limit })`
- Early destructuring: `const { data: frontmatter, content } = matter(raw)`

**Return Values:**

- Explicit returns, not implicit undefined
- Null for "not found" cases: `if (!row) return null`
- Objects/arrays for multiple values: `{ content, frontmatter, metadata }`
- Promises for async: `async function processMarkdown(filePath) { ... }`

## Module Design

**Exports:**

- Named exports preferred: `export function searchDocuments() { ... }`
- Default export in config files: `export default { ... }`
- Convention for processor modules: multiple named functions per file

**Barrel Files:**

- No barrel files (index.mjs) detected
- Each module imported directly: `import { processMarkdown } from '../processors/markdown-processor.mjs'`

**Module Responsibilities:**

- Processors: One concern per file (markdown, PDF, keyword, tree)
- Daemon modules: Separate concerns (server, scheduler, watcher, hooks)
- Scripts: Single-purpose CLI tools
- Graph/DB: Query and relationship logic

## Database Patterns

**Connection:**

- Single module function: `export function getDatabase() { ... }` in `query-utils.mjs`
- Database closed after query: `db.close()` after `db.prepare(...).all(...)`
- Pragmas for reliability: `db.pragma('foreign_keys = ON')`, `db.pragma('journal_mode = WAL')`

**Queries:**

- String template literals for SQL: `` `SELECT ... WHERE ? AND ?` ``
- Parameterized queries: `.all(...params)`, `.run(...params)` (prevents SQL injection)
- ON CONFLICT clauses for idempotency: `INSERT ... ON CONFLICT(path) DO UPDATE SET ...`

**Transactions:**

- Batch operations: `db.transaction(() => { for (const ...) { insertRel.run(...) } })()`
- Consistency for large inserts (document indexing, relationship building)

---

---
Convention analysis: 2026-03-15
