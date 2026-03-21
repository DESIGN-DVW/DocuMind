# Testing Patterns

**Analysis Date:** 2026-03-15

## Test Framework

**Runner:**

- Not configured
- No test runner detected (no `jest.config.*`, `vitest.config.*`, `mocha.config.*`)

**Assertion Library:**

- Not configured
- No assertion library installed

**Run Commands:**

- None defined in `package.json`
- Codebase is not set up for automated testing

## Test File Organization

**Location:**

- No test files present in repository
- No `__tests__` or `.test.` or `.spec.` directories

**Naming:**

- No test file naming pattern established

**Structure:**

- Not applicable

## Manual Testing Approach

The DocuMind codebase relies on **manual testing** and **script-based validation** instead of automated unit tests.

**Validation Patterns:**

- Markdown linting via `npm run lint` (markdownlint-cli2)
- Custom validation scripts: `scripts/validate-custom-errors.mjs`, `scripts/validate-timestamps.mjs`
- Dry-run mode for fixes: `npm run fix:custom:dry-run` (shows changes without writing)
- Scanner reports: `npm run scan:report` (generates markdown report)

**Test Equivalents (Script-Based):**

```bash
npm run lint               # Validate markdown syntax
npm run lint:fix          # Auto-fix markdown issues
npm run validate          # Validate timestamps/versions
npm run fix:custom:dry-run # Preview custom error fixes without applying
```

## Dry-Run Testing Pattern

The codebase uses **dry-run mode** for validating fixes before applying them.

**Implementation:** `scripts/fix-custom-errors.mjs`

```javascript
async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  // Process files with dryRun flag
  const result = await fixFile(filePath, dryRun = isDryRun);

  if (isDryRun) {
    console.log('\n💡 Run without --dry-run to apply fixes');
  }
}
```

**Usage:**

```bash
npm run fix:custom:dry-run          # Preview fixes without applying
npm run fix:custom                  # Apply fixes to current repo
npm run fix:custom:all              # Apply fixes to all repos
```

**Output:** Shows what would be fixed without modifying files.

## Mocking

**Framework:** Not configured

**Patterns:**

- No dependency injection detected
- No test doubles (mocks, stubs, spies)
- Database operations test against actual SQLite DB
- File operations test against actual filesystem

**Database Testing:**

- Uses actual `documind.db` SQLite database
- Each script reads/writes real files
- No test database fixture setup

## Fixtures and Factories

**Test Data:**

- No fixture files or factories detected
- Configuration uses real paths and constants: `ACTIVE_REPOSITORIES`, `REPO_PATH_MAP`

**Location:**

- Configuration: `config/constants.mjs`
- Custom error patterns: `config/custom-error-patterns.json`
- Markdown linting rules: `config/.markdownlint.json`

## Coverage

**Requirements:** Not enforced

**View Coverage:**

- No coverage tools configured
- `npm run docs:jsdoc` generates API documentation (not coverage)

## Test Types

**Unit Tests:**

- Not present

**Integration Tests:**

- Functional validation via dry-run mode
- Scanning and indexing verified via report output
- Database operations tested via actual queries

**E2E Tests:**

- Not automated
- Manual: Run daemon via `npm run daemon:dev`, test via HTTP API (`curl http://localhost:9000/...`)

## Common Testing Scenarios

### Scenario 1: Validate Markdown Fixes

```bash
# 1. Preview what will be fixed
npm run fix:custom:dry-run

# 2. Apply fixes
npm run fix:custom

# 3. Verify linting passes
npm run lint
```

## Scenario 2: Test Database Operations

Manual testing via Express API:

```bash
# Start daemon
npm run daemon:dev

# Test search
curl "http://localhost:9000/search?q=test"

# Test graph
curl "http://localhost:9000/graph?repo=DocuMind"

# Test stats
curl "http://localhost:9000/stats"
```

## Scenario 3: Test File Scanning

```bash
# Full scan with report
npm run scan:report

# Enhanced scan with similarity detection
npm run scan:enhanced

# Validate timestamps in indexed docs
npm run validate
```

## Scenario 4: Test Keyword Extraction

```bash
# Extract keywords from docs
npm run analyze:patterns

# View keyword cloud
curl "http://localhost:9000/keywords"
```

## Validation-First Approach

Instead of automated tests, the codebase emphasizes **validation and linting**:

**Pre-commit Validation:**

- Husky hook runs `lint-staged`
- Markdown files: `markdownlint-cli2 --fix`
- JS/JSON files: `prettier --write`

**Manual Validation Scripts:**

- `validate-timestamps.mjs` — Check version/date consistency
- `validate-custom-errors.mjs` — Test custom error pattern detection
- `fix-markdown.mjs` — Lint and auto-fix systematic issues
- `enhanced-scanner.mjs` — Detect similarities and deviations

**Report Generation:**

- `npm run scan:report` → generates `index/scan-report.md`
- `npm run report:dashboard` → deviation dashboard
- `npm run report:canonical` → canonical document report

## Database Schema Validation

**Schema File:** `scripts/db/schema.sql`

**Validation Approach:**

- `npm run db:init` — Initialize/migrate schema
- `npm run db:reset` — Drop and recreate (destructive, for testing)
- Schema enforces: primary keys, foreign keys, constraints

**Testing DB Changes:**

```bash
# Backup current DB
cp data/documind.db data/documind.db.backup

# Reset to fresh schema
npm run db:reset

# Run scans and verify
npm run scan

# Restore if needed
cp data/documind.db.backup data/documind.db
```

## Quality Assurance

**Markdown Quality:**

- MD040: All code blocks must have language type
- MD001: Heading levels increment by one
- MD022: Blank lines around headings
- MD031: Blank lines around code blocks
- Configuration: `config/.markdownlint.json`

**Code Quality:**

- Prettier for consistent formatting
- JSDoc comments for all exported functions
- No linter for JavaScript (Prettier only)

**Documentation Quality:**

- JSDoc generation: `npm run docs:jsdoc`
- Link validation: `npm run links:check`
- Report generation: `npm run tree:update`

## Testing Recommendations

If automated testing is added in the future:

**Unit Test Framework:**

- Use Vitest (modern, ESM-native, faster than Jest)
- Config: `vitest.config.mjs`

**Database Testing:**

- Use in-memory SQLite for isolation
- Fixture: Initialize schema, seed test data, teardown

**API Testing:**

- Supertest for Express endpoints
- Start daemon in test suite, make HTTP requests

**Example Test Structure (if implemented):**

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { processMarkdown } from '../processors/markdown-processor.mjs';

describe('Markdown Processor', () => {
  let db;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(fs.readFileSync('scripts/db/schema.sql', 'utf-8'));
  });

  it('should extract frontmatter from markdown', async () => {
    const result = await processMarkdown('test.md');
    expect(result.frontmatter).toEqual({ ... });
    expect(result.content).toBeDefined();
  });

  afterAll(() => {
    db.close();
  });
});
```

---

---
Testing analysis: 2026-03-15
