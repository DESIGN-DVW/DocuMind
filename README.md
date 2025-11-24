# DocuMind

## Documentation Intelligence & Management System for DESIGN-DVW organization

Automated system for scanning, linting, indexing, and managing markdown files across all DVWDesign repositories with intelligent analysis and cross-repository insights.

## 🚦 Port Registry

**⚠️ Before starting any server, check the [Port Registry](docs/PORT-REGISTRY.md)**

This project uses centralized port management to prevent conflicts. Always verify port availability before starting dev servers, Storybook, or databases.

- **Quick check:** `lsof -i :3000`
- **Full registry:** [config/port-registry.json](https://github.com/DESIGN-DVW/RootDispatcher/blob/master/config/port-registry.json)
- **Usage guide:** [docs/PORT-REGISTRY.md](docs/PORT-REGISTRY.md)

---

## ✨ Features

### Phase 1 (Complete) ✅

- 🗄️ **SQLite Database** - 8,173+ documents indexed with content hashing
- 🔍 **Cross-Repository Scanner** - Scans all DVWDesign repos for .md/.mdx files
- 🔎 **Full-Text Search** - FTS5 search across all documentation (sub-second)
- 📊 **Query Utilities** - 20+ query functions for analysis
- 📑 **Organized Index** - Generates categorized, searchable indexes
- ✅ **Validation** - Checks for missing timestamps, versions, metadata
- 🔧 **Auto-Fix** - Systematically fixes linting errors
- 👁️ **File Watcher** - Auto-updates index on file changes
- 🤖 **Agent Integration** - Works with Claude Code markdown-fixer agent

### Phase 2 (In Development) 🚧

- 🔬 **Similarity Detection** - Find duplicate and similar documents
- 📉 **Deviation Tracking** - Detect inconsistencies across repositories
- 📈 **Reporting Dashboard** - Visual dashboard for documentation health
- 🎯 **Canonical Documents** - Determine source of truth for each subject

### Phase 3 (Planned) 📋

- 🧠 **AI Learning** - Learn from manual fixes and suggest best practices
- 📚 **Practice Examples** - Auto-generate examples from common patterns
- 🏆 **Quality Scoring** - Repository documentation health scores

### Phase 4 (Planned) 🚀

- 🔌 **MCP Server** - Model Context Protocol for fast queries
- ⚡ **Performance Optimization** - Query caching and batch operations
- 🎨 **Claude Code Integration** - Deep integration with AI workflows

---

## 🚀 Quick Start

```bash
# Install
npm install

# Scan all repositories
npm run scan:report

# Create organized index
npm run index

# Validate timestamps
npm run validate

# Watch for changes
npm run watch
```

---

## 📊 What Gets Scanned

This system monitors 10 DVWDesign repositories:

- **High Priority**: FigmailAPP, FigmaDSController, @figma-core, @figma-docs, Figma-Plug-ins, Markdown
- **Medium Priority**: GlossiaApp, Contentful
- **Low Priority**: IconJar, AdobePlugIns

Total markdown files scanned: **500+** (varies by project state)

## 🛠️ Available Commands

### Scanning

```bash
npm run scan              # Scan all repositories
npm run scan:report       # Scan + generate report
```

**Outputs:**

- `index/all-markdown-files.json` - Complete scan data
- `index/scan-report.md` - Human-readable report

### Indexing

```bash
npm run index             # Create organized index
```

**Outputs:**

- `index/organized-index.md` - Categorized file list
- `index/categories.json` - JSON categories

**Categories:** Agents, Documentation, Guides, Architecture, Backend, Frontend, Shared, README, Claude Instructions, Other

### Validation

```bash
npm run validate          # Check timestamps/versions
```

**Outputs:**

- `index/validation-report.md` - Validation issues

**Checks:**

- Missing "Last Updated" timestamps
- Missing version numbers
- Missing Claude Code markers
- Recently modified files (30 days) without timestamps

### Linting

```bash
npm run lint              # Check markdown errors
npm run lint:fix          # Auto-fix errors
npm run fix               # Fix specific directory
```

**Auto-Fixes:**

- Line breaks around headings, lists, code blocks
- Empty code block language identifiers (defaults to `text`)
- Bold/italic text that should be headings

### Watching

```bash
npm run watch             # Watch for changes (Ctrl+C to stop)
```

**Features:**

- Watches all DVWDesign repositories
- Debounces updates (5 seconds after last change)
- Auto-runs scan + index on markdown file changes

### Cron Automation

```bash
npm run cron:setup        # Install cron jobs
npm run cron:list         # List installed jobs
npm run cron:stop         # Remove cron jobs
```

**Scheduled Jobs:**

- **Scan:** Every hour at :00 (`npm run scan:report`)
- **Index:** Every hour at :05 (`npm run index`)
- **Validate:** Daily at 9:00 AM (`npm run validate`)
- **Lint:** Daily at 10:00 AM (`npm run lint`)

**Logs:** All cron output goes to `logs/cron-*.log`

See [docs/CRON-SETUP.md](docs/CRON-SETUP.md) for complete guide.

## 📋 Workflow Examples

### Daily Use

```bash
# Start watcher in background
npm run watch
```

Leave running - it will auto-update indexes when you edit markdown files.

## Weekly Maintenance

```bash
# Full scan + validation
npm run scan:report
npm run index
npm run validate

# Review reports
cat index/scan-report.md
cat index/validation-report.md
```

## Before Git Commit

```bash
# Check for linting errors
npm run lint

# Auto-fix if needed
npm run lint:fix

# Verify
npm run lint
```

## 📁 Generated Files

All outputs are in `index/` (gitignored):

| File | Description |
|------|-------------|
| --- | --- |
| --- | --- |
| --- | --- |
| `all-markdown-files.json` | Complete scan data with metadata |
| --- | --- |
| --- | --- |
| --- | --- |
| `scan-report.md` | Repository breakdown, largest files, statistics |
| --- | --- |
| --- | --- |
| --- | --- |
| `organized-index.md` | Categorized file list with links |
| --- | --- |
| --- | --- |
| --- | --- |
| `categories.json` | JSON categories for programmatic access |
| --- | --- |
| --- | --- |
| --- | --- |
| `validation-report.md` | Missing timestamps/versions report |

## 🤖 Claude Code Integration

This repository includes a `markdown-fixer` agent for Claude Code:

```text
@markdown-fixer fix all repositories
@markdown-fixer validate timestamps
@markdown-fixer generate report
```

Agent location: `.claude/agents/markdown-fixer.md`

## 🔧 Configuration

### Add Repository

Edit `scripts/scan-all-repos.mjs`:

```javascript
const REPOS = [
  // ... existing
  { name: 'NewRepo', priority: 'medium', active: true },
];
```

### Customize Linting

Edit `config/.markdownlint.json`:

```json
{
  "MD040": true,  // Enforce code block types (GLOBAL POLICY)
  "MD013": false  // Disable line length (too strict for links)
}
```

## 📚 Documentation

### Core Documentation

- **[CLAUDE.md](CLAUDE.md)** - Comprehensive usage guide for Claude Code
- **[config/.markdownlint.json](config/.markdownlint.json)** - Linting rules
- **[.claude/agents/markdown-fixer.md](.claude/agents/markdown-fixer.md)** - Agent documentation

### DocuMind System

- **[docs/CONVERSATION-2025-11-07-DOCUMIND-DESIGN.md](docs/CONVERSATION-2025-11-07-DOCUMIND-DESIGN.md)** - Complete design conversation and architecture
- **[docs/PHASE-1-COMPLETION-REPORT.md](docs/PHASE-1-COMPLETION-REPORT.md)** - Phase 1 implementation details and status
- **[docs/AGENT-QUICK-REFERENCE.md](docs/AGENT-QUICK-REFERENCE.md)** - Quick reference for AI agents
- **[scripts/db/query-utils.mjs](scripts/db/query-utils.mjs)** - Query API documentation (JSDoc)

## 🔗 Related Projects

- **[@figma-docs](https://github.com/DESIGN-DVW/@figma-docs)** - Documentation sync system
- **[FigmailAPP](https://github.com/DESIGN-DVW/FigmailAPP)** - Origin of markdown infrastructure

## 📄 License

MIT

**Version:** 1.0.0
**Last Updated:** 2025-11-06
**Status:** ✅ Production Ready
