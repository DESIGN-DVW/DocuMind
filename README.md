# Markdown Repository

**Centralized Markdown Management for DVWDesign Organization**

Automated system for scanning, linting, indexing, and managing markdown files across all DVWDesign repositories.

---

## ✨ Features

- 🔍 **Cross-Repository Scanner** - Scans all DVWDesign repos for .md/.mdx files
- 📑 **Organized Index** - Generates categorized, searchable indexes
- ✅ **Validation** - Checks for missing timestamps, versions, metadata
- 🔧 **Auto-Fix** - Systematically fixes linting errors
- 👁️ **File Watcher** - Auto-updates index on file changes
- 🤖 **Agent Integration** - Works with Claude Code markdown-fixer agent

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

---

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

---

## 📋 Workflow Examples

### Daily Use

```bash
# Start watcher in background
npm run watch
```

Leave running - it will auto-update indexes when you edit markdown files.

### Weekly Maintenance

```bash
# Full scan + validation
npm run scan:report
npm run index
npm run validate

# Review reports
cat index/scan-report.md
cat index/validation-report.md
```

### Before Git Commit

```bash
# Check for linting errors
npm run lint

# Auto-fix if needed
npm run lint:fix

# Verify
npm run lint
```

---

## 📁 Generated Files

All outputs are in `index/` (gitignored):

| File | Description |
|------|-------------|
| `all-markdown-files.json` | Complete scan data with metadata |
| `scan-report.md` | Repository breakdown, largest files, statistics |
| `organized-index.md` | Categorized file list with links |
| `categories.json` | JSON categories for programmatic access |
| `validation-report.md` | Missing timestamps/versions report |

---

## 🤖 Claude Code Integration

This repository includes a `markdown-fixer` agent for Claude Code:

```text
@markdown-fixer fix all repositories
@markdown-fixer validate timestamps
@markdown-fixer generate report
```

Agent location: `.claude/agents/markdown-fixer.md`

---

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

---

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)** - Comprehensive usage guide for Claude Code
- **[config/.markdownlint.json](config/.markdownlint.json)** - Linting rules
- **[.claude/agents/markdown-fixer.md](.claude/agents/markdown-fixer.md)** - Agent documentation

---

## 🔗 Related Projects

- **[@figma-docs](https://github.com/DVWDesign/FigmaAPI/@figma-docs)** - Documentation sync system
- **[FigmailAPP](https://github.com/DVWDesign/FigmaAPI/FigmailAPP)** - Origin of markdown infrastructure

---

## 📄 License

MIT

---

**Version:** 1.0.0
**Last Updated:** 2025-11-06
**Status:** ✅ Production Ready
