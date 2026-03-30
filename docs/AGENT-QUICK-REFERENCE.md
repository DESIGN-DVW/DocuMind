# DocuMind Agent Quick Reference

**For:** Claude Code agents working with DocuMind system
**Location:** `/Users/Shared/htdocs/github/DVWDesign/Markdown`
**Status:** Phase 1 Complete, Phase 2 Ready

---

## Repository Overview

**Purpose:** Centralized markdown management, linting, and documentation intelligence for DVWDesign organization.

### Key Features:

- SQLite database with 8,173+ documents

- Content hashing for change detection

- Full-text search (FTS5)

- Similarity detection (Phase 2)

- Deviation tracking (Phase 2)

- MCP server integration (Phase 4)

---

## Quick Start

### Initialize System

```bash

cd /Users/Shared/htdocs/github/DVWDesign/Markdown
npm install                    # Install dependencies (if needed)
npm run db:init                # Initialize database
npm run scan:enhanced          # Scan all repositories

```text

### Common Commands

```bash

# Database

npm run db:init                # Initialize database
npm run db:reset               # Reset database

# Scanning

npm run scan:enhanced          # Scan all repos with content hashing

# Analysis (Phase 2)

npm run analyze:similarities   # Detect similar documents
npm run analyze:deviations     # Detect inconsistencies
npm run analyze:all            # Run all analysis

# Reporting (Phase 2)

npm run report:dashboard       # Visual deviation dashboard
npm run report:canonical       # Canonical document report

# Legacy (Phase 0)

npm run scan:report            # Original scanner (JSON output)
npm run index                  # Create organized index
npm run validate               # Validate timestamps
npm run lint                   # Check markdown errors
npm run lint:fix               # Auto-fix errors

```text

---

## File Structure

```text

Markdown/
├── .claude/
│   └── commands/              # Slash commands
│       └── scan-docs.md       # /scan-docs command
├── data/
│   └── documind.db            # SQLite database (gitignored)
├── docs/
│   ├── CONVERSATION-2025-11-07-DOCUMIND-DESIGN.md   # Design doc
│   ├── PHASE-1-COMPLETION-REPORT.md                 # Phase 1 report
│   └── AGENT-QUICK-REFERENCE.md                     # This file
├── scripts/
│   ├── db/
│   │   ├── schema.sql                    # Database schema
│   │   ├── init-database.mjs             # Initialize DB
│   │   └── query-utils.mjs               # Query functions (20+)
│   ├── scan/
│   │   └── enhanced-scanner.mjs          # Scanner with hashing
│   ├── analysis/                         # Phase 2
│   │   ├── detect-similarities.mjs       # To be created
│   │   └── detect-deviations.mjs         # To be created
│   └── reports/                          # Phase 2
│       ├── deviation-dashboard.mjs       # To be created
│       └── canonical-report.mjs          # To be created
├── package.json               # Dependencies and scripts
└── README.md                  # Project overview

```text

## Database Schema

### Main Tables

1. **documents** - Core document metadata

   - path, repository, filename, category

   - version, created_at, modified_at

   - file_size, line_count, word_count

   - content_hash (SHA-256)

   - frontmatter (JSON), content (full text)

2. **linting_issues** - Markdown linting problems

   - document_id, rule_code, line_number

   - severity, message, auto_fixable

   - fixed_at, fix_applied

3. **content_similarities** - Similar document pairs

   - doc1_id, doc2_id, similarity_score

   - deviation_type (duplicate/variant/outdated/partial)

   - detected_at

4. **deviations** - Documentation inconsistencies

   - document_id, deviation_type, severity

   - description, suggested_fix

   - detected_at, resolved_at, resolver

5. **canonical_docs** - Source of truth documents

   - subject, canonical_doc_id, reason

   - confidence_score, manual_override

   - variants (JSON array)

6. **learning_patterns** - AI learning from fixes

   - rule_code, pattern_type

   - before_example, after_example

   - explanation, frequency, confidence

7. **scan_history** - Scan audit trail

   - scan_started, scan_completed

   - repositories_scanned, documents_found

   - documents_added, documents_updated

   - duration_ms, status

8. **statistics** - Global stats

   - stat_name, stat_value, updated_at

### Views

1. **documents_with_issues** - Docs with linting issues

2. **similar_pairs** - Similar document pairs (>70% similarity)

3. **canonical_overview** - Canonical docs with variants

4. **unresolved_deviations** - Pending deviations

## Query Utilities

### Import:

```javascript

import {
  searchDocuments,
  findDuplicates,
  getRepositoryStats,
  // ... see full list in query-utils.mjs
} from './scripts/db/query-utils.mjs';

```text

### Search Functions

```javascript

// Full-text search
searchDocuments('MJML integration', {
  repository: 'FigmailAPP',
  category: 'backend',
  limit: 20
});

// Filename search
searchByFilename('%.tsx', {
  repository: 'FigmailAPP',
  limit: 50
});

```text

### Similarity Functions

```javascript

// Find similar documents
findSimilarDocuments(documentId, 0.7);

// Find duplicates (>90% similarity)
findDuplicates(0.9);

```text

### Deviation Functions

```javascript

// Unresolved deviations
getUnresolvedDeviations({
  severity: 'critical',
  repository: 'FigmailAPP'
});

// Deviation statistics
getDeviationStats();

```text

### Stats Functions

```javascript

// Repository statistics
getRepositoryStats();

// Category breakdown
getCategoryStats('FigmailAPP');

// Recent changes
getRecentlyModified(7, 50);  // Last 7 days

// Global stats
getGlobalStats();

```text

**See:** `scripts/db/query-utils.mjs` for full API documentation

## Repositories Scanned

### High Priority (6 repos)

- **FigmailAPP** - 4,501 docs, 39 MB

- **Figma-Plug-ins** - 1,395 docs, 8 MB

- **FigmaDSController** - 1,019 docs, 7 MB

- **@figma-core** - Shared core libraries

- **@figma-docs** - Documentation sync

- **Markdown** - This repository

### Medium Priority (2 repos)

- **GlossiaApp** - 1,010 docs, 5 MB

- **Contentful** - 236 docs, 1 MB

### Low Priority (2 repos)

- **IconJar** - Icon management

- **AdobePlugIns** - Adobe plugin tools

**Total:** 10 repositories, 8,173 documents, 60.54 MB

## Category Detection

### Automatic categorization based on file path:

| Path Pattern | Category |

| -------------- | ---------- |

| `/.claude/agents/` | agents |

| `/docs/01-agents/` | agents |

| `/docs/02-backend/` | backend |

| `/docs/03-frontend/` | frontend |

| `/docs/04-architecture/` | architecture |

| `/docs/05-guides/` | guides |

| `/docs/06-issues/` | issues |

| `/docs/99-shared/` | shared |

| `/docs/00-references/` | references |

| `README.md` | readme |

| `CLAUDE.md` | claude-instructions |

| `/docs/*` | documentation |

| Other | other |

## Workflows

### Add New Repository

**Edit:** `scripts/scan/enhanced-scanner.mjs`

```javascript

const REPOS = [
  // ... existing
  { name: 'NewRepo', path: '/path/to/new/repo', priority: 'medium' },
];

```text

Then run:

```bash

npm run scan:enhanced

```text

### Find Duplicate Documentation

#### Phase 2 (Upcoming):

```bash

npm run analyze:similarities

```text

#### Manual Query (Now):

```javascript

import { findDuplicates } from './scripts/db/query-utils.mjs';
const duplicates = findDuplicates(0.9);  // 90% similarity threshold

```text

### Search Documentation

### Example: Find all MJML-related docs in FigmailAPP**

```javascript

import { searchDocuments } from './scripts/db/query-utils.mjs';

const results = searchDocuments('MJML', {
  repository: 'FigmailAPP',
  limit: 50
});

results.forEach(doc => {
  console.log(doc.path);
  console.log(doc.snippet);  // Highlighted snippet
});

```text

### Track Recent Changes

### Example: See what changed in last 7 days**

```javascript

import { getRecentlyModified } from './scripts/db/query-utils.mjs';

const recent = getRecentlyModified(7, 50);
recent.forEach(doc => {
  console.log(`${doc.repository}/${doc.path}`);
  console.log(`Modified: ${doc.modified_at}`);
});

```text

## Phase Implementation Status

### ✅ Phase 1: Foundation (Complete)

- Database schema with 8 tables

- Content hashing (SHA-256)

- Enhanced scanner (10,493 files in 14s)

- Query utilities (20+ functions)

- Full-text search (FTS5)

### ⏳ Phase 2: Similarity & Deviations (Week 2-4)

- Similarity detection algorithm

- Duplicate detection

- Deviation tracking

- Interactive CLI tool

- Reporting dashboard

### ⏳ Phase 3: AI Learning (Week 5-6)

- Learn from manual fixes

- Pattern extraction

- Canonical determination

- Practice example generation

### ⏳ Phase 4: MCP Integration (Week 7-8)

- MCP server implementation

- Claude Code integration

- Performance optimization

- Query caching

## Common Tasks

### Initialize New Client Project

```bash

# 1. Copy core files

cp -r scripts/db/ [client-repo]/scripts/db/
cp -r scripts/scan/ [client-repo]/scripts/scan/
cp .claude/commands/scan-docs.md [client-repo]/.claude/commands/

# 2. Update repository paths in enhanced-scanner.mjs

# 3. Install dependencies

cd [client-repo]
npm install better-sqlite3 chalk gray-matter glob ora string-similarity

# 4. Initialize

npm run db:init
npm run scan:enhanced

```text

## Debug Database

```bash

# Direct SQLite access

sqlite3 data/documind.db

# Useful queries

SELECT COUNT(*) FROM documents;
SELECT repository, COUNT(*) FROM documents GROUP BY repository;
SELECT * FROM scan_history ORDER BY scan_started DESC LIMIT 5;
PRAGMA table_info(documents);

```text

## Reset and Rescan

```bash

npm run db:reset           # Delete and recreate database
npm run scan:enhanced      # Scan all repositories

```text

## Error Handling

### Common Issues

### 1. Missing Repository**

```text

✗ Repository not found: /path/to/repo

```text

**Fix:** Check repository path in `enhanced-scanner.mjs`

### 2. Schema Mismatch**

```text

SqliteError: table X has no column named Y

```text

**Fix:** Run `npm run db:reset` to recreate database with latest schema

### 3. File Parse Errors**

```text

Error parsing file.md: ENOENT: no such file or directory

```text

**Fix:** Non-critical - broken symlink, will be skipped

### 4. Gray-Matter Engine Error**

```text

gray-matter engine "announcement" is not registered

```text

**Fix:** Non-critical - unsupported frontmatter format, will be skipped

## Performance

### Scan Performance

#### Metrics (10 repositories, 10,493 files):

- First scan: ~25 seconds (all files parsed)

- Second scan: ~14 seconds (93% files skipped via hash comparison)

- Database size: ~60 MB

- Memory usage: ~150 MB peak

### Query Performance

#### FTS5 Full-Text Search:

- 8,000+ documents

- Sub-second response time

- Boolean operators supported

- Rank-based sorting

### Optimization Tips

1. Use content hash to skip unchanged files

2. Enable query caching (Phase 4)

3. Use indexes for common queries

4. Batch operations when possible

## Documentation

### Essential Reading:

1. [CONVERSATION-2025-11-07-DOCUMIND-DESIGN.md](CONVERSATION-2025-11-07-DOCUMIND-DESIGN.md) - Complete design discussion

2. [PHASE-1-COMPLETION-REPORT.md](PHASE-1-COMPLETION-REPORT.md) - Implementation details

3. [README.md](../README.md) - Project overview

### Code Documentation:

- All query functions have JSDoc comments

- Database schema is fully commented

- Scanner includes inline explanations

## Agent Collaboration

### For doc-classifier Agent

When organizing DocuMind files:

- Keep database schema in `scripts/db/` (with code)

- Design documents go in `docs/`

- API documentation in `docs/api/` (if created)

- Usage examples in `docs/examples/` (if created)

### For markdown-fixer Agent

DocuMind markdown standards:

- Code blocks must have language identifiers (MD040)

- Use version and timestamp in all docs

- Consistent table formatting

- ATX-style headings preferred

### For similarity-analyzer Agent (Phase 2)

When detecting similar documents:

- Use string-similarity library

- Threshold: 0.7 for variants, 0.9 for duplicates

- Store results in content_similarities table

- Generate deviation records for inconsistencies

## Contact & Support

**Primary Repository:** `/Users/Shared/htdocs/github/DVWDesign/Markdown`
**Organization:** DVWDesign
**Created:** 2025-11-06
**Phase 1 Complete:** 2025-11-07

### For Questions:

- Check conversation log: `docs/CONVERSATION-2025-11-07-DOCUMIND-DESIGN.md`

- Check completion report: `docs/PHASE-1-COMPLETION-REPORT.md`

- Review code comments in `scripts/db/query-utils.mjs`

**Last Updated:** 2025-11-07
**Version:** 1.0.0
**Status:** ✅ Phase 1 Complete, Ready for Phase 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
