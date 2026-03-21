# DocuMind System Design - Conversation Summary

**Date:** 2025-11-07
**Session:** FigmailAPP Workspace MVP Testing → MJML Dev Mode → Documentation System
**Duration:** Extended multi-topic session
**Status:** ✅ Design Complete, Ready for Implementation

---

## 🎯 Context: How We Got Here

### Initial Task: Workspace MVP Testing

Started with testing TreeView-Preview synchronization features in FigmailAPP workspace.

**Key Bugs Fixed:**

- BUG-006: Scroll-to-element using wrong CSS selector
- BUG-007: Node label badge positioning
- BUG-008: Backend regex too restrictive for HTML tag matching
- BUG-009: Text content displayed instead of node type

**Critical Discovery:** The NODE_ID comment injection system (battle-tested 3-4 years in production) needed to be extracted as standalone open-source project.

### Pivot: MJML Dev Mode Repository

Created comprehensive standalone repository at `/Users/Shared/htdocs/github/DVWDesign/mjml-dev-mode/`

**Deliverables:**

- Core library (commentInjector.js, expressMiddleware.js)
- Complete documentation (2,800+ lines: README, API, Integration, Examples)
- Working Express server example with automated tests
- Production-ready package.json for npm publishing

**Value Proposition:** Solves 3-4 year problem of TreeView-Preview synchronization for MJML visual editors.

### Evolution: Documentation Management

User created `/Users/Shared/htdocs/github/DVWDesign/Markdown/` repository for centralized markdown management across 10 DVWDesign repositories.

**User's Questions Led to DocuMind:**

1. How to enforce markdown linting rules with examples?
2. How to detect inconsistencies across repositories?
3. How to determine which version is "canonical"?
4. How to track deviations over time?
5. Should we build an AI agent + MCP server for this?

---

## 💡 DocuMind System Design

### Problem Statement

**Core Issues:**

- 500+ markdown files across 10 repositories
- Linting rules not consistently applied
- Same subject documented differently across repos
- No way to track which version is "right"
- Manual fixes not captured as learning patterns
- Need intelligent cross-repo analysis

**User's Vision:**
> "An AI Agent at the Root level that can assess which version is right, track derivations, and serve as an MCP internal server for faster interrogation."

---

## 🏗️ System Architecture

### Components

#### 1. **Scanner & Analyzer** (Enhanced Existing)

- Cross-repo markdown scanner
- Content hashing for change detection
- Frontmatter extraction
- Metadata validation

#### 2. **Consistency Engine** (New)

- Similarity detection (fuzzy matching)
- Duplicate identification
- Variant tracking
- Content comparison

#### 3. **Deviation Tracker** (New)

- Monitors document changes over time
- Detects content drift
- Tracks resolution actions
- Maintains deviation history

#### 4. **AI Learning System** (New)

- Learns from manual linting fixes
- Generates practice examples
- Identifies anti-patterns
- Suggests improvements

#### 5. **MCP Query Server** (New)

- Fast document search
- Similarity queries
- Deviation checks
- Canonical document lookup

## 🗄️ Database Design

### Technology Choice: SQLite + JSON Hybrid

**SQLite Benefits:**

- ✅ File-based (no server needed)
- ✅ Fast queries (perfect for MCP)
- ✅ Full SQL support
- ✅ Lightweight (~1MB overhead)
- ✅ 281 TB max capacity (practically unlimited)
- ✅ Estimated usage: ~50MB for 500 docs

**JSON Supplement:**

- Flexible document metadata
- Git-friendly change tracking
- Fast file-based access

### Schema Overview

**8 Main Tables:**

1. **documents** - Core document metadata
   - Path, repository, filename
   - Version, timestamps
   - Content hash (SHA-256)
   - Frontmatter (JSON)
   - File statistics (size, lines, words)

2. **linting_issues** - Markdown linting errors
   - Rule code (e.g., MD040)
   - Line number, severity
   - Auto-fixable flag
   - Resolution timestamp

3. **content_similarities** - Document comparison
   - Doc pair IDs
   - Similarity score (0.0-1.0)
   - Deviation type (duplicate, variant, outdated)

4. **deviations** - Change tracking
   - Document relationships
   - Deviation type (content_drift, structure_change)
   - Severity (critical, major, minor)
   - Resolution actions

5. **learning_patterns** - AI training data
   - Rule code
   - Before/after examples
   - Frequency tracking
   - Explanations

6. **canonical_docs** - Source of truth
   - Subject mapping
   - Canonical document ID
   - Establishment reason
   - Variant list

7. **query_cache** - MCP performance
   - Query hash
   - Cached results
   - Expiration
   - Hit count

8. **metadata_index** - Fast lookups
   - Tag indexing
   - Category indexing
   - Cross-references

## 🛠️ Technology Stack

### Core Dependencies

```json
{
  "database": {
    "better-sqlite3": "^9.2.2",     // Fastest SQLite driver
    "knex": "^3.1.0"                 // Query builder (optional)
  },
  "markdown": {
    "markdown-it": "^14.0.0",        // Parser
    "markdownlint": "^0.33.0",       // Linter
    "gray-matter": "^4.0.3"          // Frontmatter
  },
  "analysis": {
    "natural": "^6.7.0",             // NLP
    "string-similarity": "^4.0.4",   // Fuzzy matching
    "fast-levenshtein": "^3.0.0",    // Edit distance
    "diff": "^5.1.0"                 // Text diffing
  },
  "watching": {
    "chokidar": "^3.5.3",            // File watcher
    "fast-glob": "^3.3.2",           // Fast globbing
    "ignore": "^5.3.0"               // .gitignore parser
  },
  "mcp": {
    "@modelcontextprotocol/sdk": "^1.0.0",  // MCP SDK
    "express": "^4.18.2"             // HTTP server
  },
  "utilities": {
    "date-fns": "^3.0.6",            // Date handling
    "zod": "^3.22.4",                // Schema validation
    "chalk": "^5.3.0",               // Terminal colors
    "ora": "^8.0.1",                 // Loading spinners
    "table": "^6.8.1"                // CLI tables
  }
}
```text

**Estimated Total Size:** ~50MB node_modules

## 🎯 Canonical Determination Strategy

### Scoring Algorithm

**Factors Considered:**

1. **Reference Count** (Weight: 10 points each)
   - How many other docs link to this one
   - More references = more authoritative

2. **Recency** (Weight: 0-100 points)
   - Days since last modification
   - `score = max(0, 100 - daysSinceModified)`

3. **Repository Priority** (Weight: 50 points)
   - FigmailAPP = +50 (production app)
   - @figma-core = +50 (shared core)
   - Other repos = 0

4. **Version Number** (Weight: Variable)
   - Semantic versioning scoring
   - `score = (major × 100) + (minor × 10) + patch`

5. **Manual Override** (Weight: 1000 points)
   - User can manually mark canonical
   - Overrides all automatic scoring

**Example Calculation:**

```text
Document A (FigmailAPP):
- References: 5 → 50 points
- Modified: 2 days ago → 98 points
- Repository: FigmailAPP → 50 points
- Version: 2.1.0 → 211 points
Total: 409 points ✅ CANONICAL

Document B (@figma-docs):
- References: 2 → 20 points
- Modified: 10 days ago → 90 points
- Repository: @figma-docs → 0 points
- Version: 2.0.0 → 200 points
Total: 310 points ❌ VARIANT
```text

### Resolution Strategies

#### Strategy A: Auto-Merge

- Combine best parts of variants
- AI-assisted intelligent merge
- Create new canonical version
- Archive old variants

#### Strategy B: Keep Variants

- Mark one as canonical
- Tag others as "deprecated" or "alternative"
- Add cross-references
- Document differences

#### Strategy C: Repository-Specific Metadata

- Allow controlled deviations
- Track divergence reasons
- Maintain parallel versions
- Document when/why to use each

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1)

**Tasks:**

1. Database initialization
   - Create SQLite schema
   - Add indexes for performance
   - Setup migrations system

2. Enhanced scanner
   - Content hashing
   - Metadata extraction
   - Batch processing

3. Basic queries
   - Document search
   - Category filtering
   - Repository filtering

**Deliverables:**

- `data/documind.db` (SQLite database)
- `scripts/db/init-database.mjs`
- `scripts/scan/enhanced-scanner.mjs`
- Migration files

### Phase 2: Consistency Engine (Week 2)

**Tasks:**

1. Similarity detection
   - String comparison algorithms
   - Threshold configuration
   - Batch processing

2. Deviation identification
   - Content drift detection
   - Structure comparison
   - Rule violation tracking

3. Reporting dashboard
   - CLI visualization
   - HTML reports
   - Export to JSON/CSV

**Deliverables:**

- `scripts/analysis/detect-similarities.mjs`
- `scripts/analysis/detect-deviations.mjs`
- `scripts/reports/deviation-dashboard.mjs`

### Phase 3: AI Learning (Week 3)

**Tasks:**

1. Pattern extraction
   - Learn from manual fixes
   - Identify common mistakes
   - Build fix database

2. Example generation
   - Create practice exercises
   - Generate explanations
   - Build rule library

3. Smart suggestions
   - Context-aware recommendations
   - Auto-fix proposals
   - Best practice guidance

**Deliverables:**

- `scripts/learning/learn-patterns.mjs`
- `scripts/learning/generate-examples.mjs`
- `docs/LINTING-GUIDE.md` (auto-generated)

### Phase 4: MCP Server (Week 4)

**Tasks:**

1. Server implementation
   - MCP SDK integration
   - Tool definitions
   - Query handlers

2. Performance optimization
   - Query caching
   - Index optimization
   - Response compression

3. Installation & testing
   - Claude Code integration
   - Agent compatibility
   - Performance benchmarks

**Deliverables:**

- `mcp-server/index.mjs`
- Installation instructions
- Performance documentation

## 📋 NPM Scripts

```json
{
  "scripts": {
    "db:init": "node scripts/db/init-database.mjs",
    "db:migrate": "node scripts/db/migrate.mjs",
    "db:seed": "node scripts/db/seed.mjs",

    "scan": "node scripts/scan-all-repos.mjs",
    "scan:enhanced": "node scripts/scan/enhanced-scanner.mjs",
    "scan:report": "npm run scan && npm run index",

    "analyze:similarities": "node scripts/analysis/detect-similarities.mjs",
    "analyze:deviations": "node scripts/analysis/detect-deviations.mjs",
    "analyze:all": "npm run analyze:similarities && npm run analyze:deviations",

    "learn:patterns": "node scripts/learning/learn-patterns.mjs",
    "learn:examples": "node scripts/learning/generate-examples.mjs",

    "report:dashboard": "node scripts/reports/deviation-dashboard.mjs",
    "report:canonical": "node scripts/reports/canonical-report.mjs",

    "resolve:interactive": "node scripts/resolve/interactive-resolver.mjs",
    "resolve:auto": "node scripts/resolve/auto-resolver.mjs",

    "mcp:start": "node mcp-server/index.mjs",
    "mcp:test": "node mcp-server/test-client.mjs",

    "watch": "node scripts/watch-and-index.mjs"
  }
}
```text

## 🔍 Slash Commands

**Created:**

- ✅ `/scan-docs` - Scan all repos for markdown

**To Create:**

- `/lint-docs` - Lint and auto-fix markdown
- `/validate-docs` - Check timestamps/versions
- `/index-docs` - Generate organized index
- `/watch-docs` - Start file watcher
- `/analyze-docs` - Run similarity + deviation analysis
- `/resolve-docs` - Interactive deviation resolution
- `/canonical-docs` - Show canonical documents by subject
- `/learn-docs` - Generate linting practice examples

## ❓ User's Answers Needed

### 1. Canonical Source Priority

**Question:** Should FigmailAPP always be source of truth? Or @figma-core?

**Options:**

- A: FigmailAPP (production app)
- B: @figma-core (shared infrastructure)
- C: Context-dependent (AI decides)
- D: Manual approval required

**User Answer:** *[Pending]*

### 2. Auto-Resolution

**Question:** Should system auto-merge variants or always ask?

**Options:**

- A: Always ask (safe, manual control)
- B: Auto-merge if similarity > 90% (semi-automated)
- C: Auto-merge all (fully automated, risky)
- D: Different rules per deviation type

**User Answer:** *[Pending]*

### 3. Deviation Tolerance

**Question:** How different is "too different"?

**Options:**

- A: 70% similarity = variant (strict)
- B: 80% similarity = variant (moderate)
- C: 90% similarity = variant (lenient)
- D: Configurable per subject

**User Answer:** *[Pending]*

### 4. Version Strategy

**Question:** Prefer newer version or more referenced version?

**Options:**

- A: Newer always wins (recency bias)
- B: More referenced wins (popularity bias)
- C: Weighted scoring (balanced)
- D: Manual review required

**User Answer:** *[Pending]*

### 5. MCP Server Mode

**Question:** Should MCP server run as daemon or on-demand?

**Options:**

- A: Daemon (always running, faster)
- B: On-demand (Claude starts it, saves resources)
- C: Both modes supported

**User Answer:** *[Pending]*

## 📊 Success Metrics

### Performance Targets

- Query response time: < 100ms (cached)
- Query response time: < 500ms (uncached)
- Similarity detection: < 5 seconds for 500 docs
- Full scan: < 30 seconds for 10 repos

### Quality Targets

- Canonical accuracy: > 95%
- False positive deviations: < 5%
- Linting auto-fix success: > 90%
- Pattern learning accuracy: > 85%

## 🔗 Related Projects

### Existing Infrastructure

- **FigmailAPP** - Source of MJML Dev Mode system
- **@figma-core** - Shared agents and scripts
- **Markdown** - Documentation management (this repo)

### New Projects Created

- **mjml-dev-mode** - Standalone NODE_ID injection system
- **DocuMind** - Documentation intelligence system (this design)

## 📝 Key Insights from Conversation

### 1. Permission System Discussion

User wants to eliminate "permission fatigue" where Claude repeatedly asks for same permissions.

**Solution Designed:**

- `.claude/permissions.json` with auto-approve rules
- Agent-specific power delegation
- Domain-based permissions
- Context-aware authorization

**Status:** Design complete, pending implementation

### 2. Git Tools vs GitLens

User asked about overlap between Claude's git tools and GitLens extension.

**Answer:** They complement each other

- GitLens: Visual exploration, blame, history
- Claude: Automation, intelligent operations, pattern analysis
- Keep both, use each for its strengths

### 3. Markdown Repository Role

User created comprehensive markdown management system with:

- Cross-repo scanning
- Linting automation
- Cron jobs
- File watching

**Enhancement:** Add intelligent deviation tracking (DocuMind)

## 🎯 Next Actions

### Immediate (Today)

1. ✅ Document conversation (this file)
2. ⏳ Build Phase 1: Database + Scanner
3. ⏳ Test with existing Markdown repo

### Week 1

- Complete database schema
- Enhanced scanner with hashing
- Basic similarity detection

### Week 2-4

- Full DocuMind implementation
- MCP server
- Interactive CLI tools

## 🏆 Expected Outcomes

### For User

- ✅ Consistent documentation across all repos
- ✅ Automatic detection of duplicates/variants
- ✅ Clear "source of truth" for each subject
- ✅ Learning from manual fixes
- ✅ Fast MCP-powered queries

### For Team

- ✅ Reduced documentation debt
- ✅ Better onboarding (canonical docs)
- ✅ Fewer inconsistencies
- ✅ Self-improving system

### For Community

- ✅ Open-source MJML Dev Mode package
- ✅ Potential open-source DocuMind
- ✅ Documentation best practices

## 📚 Documentation Generated

### This Session Created:

**MJML Dev Mode Repository:**

- README.md (800+ lines)
- docs/API.md (600+ lines)
- docs/INTEGRATION.md (800+ lines)
- docs/EXAMPLES.md (600+ lines)
- PROJECT-STATUS.md (comprehensive)
- Working Express server example
- Test client with automation

**Markdown Repository Enhancements:**

- First slash command: /scan-docs
- Permission system design
- DocuMind architecture (this document)

**Total Documentation:** 4,000+ lines across multiple files

## 💭 Philosophical Insights

### The Documentation Problem

Documentation naturally diverges over time as teams work in parallel across repositories. Without intelligent tracking, teams waste time:

- Searching for the "right" version
- Manually comparing variants
- Recreating documentation that exists elsewhere
- Fixing the same linting issues repeatedly

### The AI Solution

DocuMind represents a shift from manual documentation management to **intelligent documentation orchestration**:

- System learns from human fixes
- AI determines canonical sources
- Automated consistency enforcement
- Self-improving over time

### The MCP Innovation

By exposing documentation intelligence through MCP, we enable:

- Claude agents to query docs instantly
- Context-aware documentation suggestions
- Real-time consistency checks
- Integration with development workflow

## 🚀 Vision: Documentation as Code

**DocuMind enables treating documentation like code:**

```bash
# Test documentation
npm run test:docs

# Lint documentation
npm run lint:docs

# Deploy documentation
npm run deploy:docs

# Validate documentation
npm run validate:docs
```text

**With CI/CD integration:**

- Pre-commit: Lint + validate
- Pre-push: Consistency check
- Post-merge: Regenerate indexes
- Nightly: Full deviation scan

## 🎓 Lessons Learned

### 1. **Battle-Tested > Clean Slate**

The MJML Dev Mode system is valuable BECAUSE it's been battle-tested for 3-4 years. Starting from scratch would have taken months to debug edge cases.

### 2. **Context Switching is Valuable**

This conversation started with workspace MVP bugs, pivoted to MJML repository extraction, and evolved into comprehensive documentation intelligence. Each pivot added value.

### 3. **User Pain Points Drive Innovation**

User's frustration with repetitive permission prompts → Permission system design
User's observation of doc inconsistencies → DocuMind system

### 4. **Incremental > Big Bang**

Build in phases:

- Phase 1: Foundation (works standalone)
- Phase 2: Add intelligence (enhances Phase 1)
- Phase 3: Add learning (enhances Phase 2)
- Phase 4: Add MCP (integrates everything)

## 📌 Status: Ready to Build

**Design:** ✅ Complete
**User Approval:** ✅ "Doc this conversation. And, yes, Build!"
**Next Step:** Begin Phase 1 implementation

**Version:** 1.0.0
**Last Updated:** 2025-11-07T15:00:00+01:00
**Status:** 📋 Design Document - Ready for Implementation

## Appendix: Technology Decisions Rationale

### Why SQLite over PostgreSQL?

- No server setup required
- Single file database (easy backup)
- Perfect for < 10GB data
- Faster for read-heavy workloads
- Ideal for MCP server (low latency)

### Why Not MongoDB?

- Don't need schema flexibility
- SQL queries more intuitive for tabular data
- Better full-text search in SQLite
- Simpler deployment

### Why String Similarity over Vector DB?

- String similarity sufficient for markdown comparison
- Vector DB overkill for 500 documents
- Can add vector search later if needed
- Lower complexity

### Why MCP over REST API?

- Native Claude integration
- Lower latency (stdio transport)
- Better agent experience
- Future-proof (MCP is growing standard)

**End of Design Document**
