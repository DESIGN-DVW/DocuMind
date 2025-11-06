# CLAUDE.md - Markdown Repository

## Centralized Markdown Management for DVWDesign Organization

**Version:** 1.1.0
**Created:** 2025-11-06
**Last Updated:** 2025-11-06

---

## 🎯 Purpose

This repository provides centralized markdown file management, linting, indexing, and automation for all DVWDesign repositories.

**Key Functions:**

- Scan all repositories for markdown files
- Generate searchable indexes
- Validate timestamps and versions
- Auto-fix systematic linting errors
- Watch for changes and auto-update

---

## 📁 Repository Structure

```text
Markdown/
├── scripts/
│   ├── fix-markdown.mjs          # Auto-fix linting errors
│   ├── scan-all-repos.mjs        # Scan all repositories
│   ├── index-markdown.mjs        # Generate organized index
│   ├── validate-timestamps.mjs   # Validate metadata
│   └── watch-and-index.mjs       # Watch for changes
├── config/
│   └── .markdownlint.json        # Linting configuration
├── .claude/
│   └── agents/
│       └── markdown-fixer.md     # Markdown fixer agent
├── index/                        # Generated indexes (gitignored)
│   ├── all-markdown-files.json
│   ├── organized-index.md
│   ├── categories.json
│   ├── scan-report.md
│   └── validation-report.md
├── docs/                         # Repository documentation
├── package.json                  # NPM configuration
├── .gitignore
├── CLAUDE.md                     # This file
└── README.md                     # Usage instructions
```

---

## 🚀 Quick Start

### Installation

```bash
cd /Users/Shared/htdocs/github/DVWDesign/Markdown
npm install
```

### Basic Usage

```bash
npm run scan                # Scan all repositories
npm run scan:report         # Generate detailed report
npm run index               # Create organized index
npm run validate            # Validate timestamps/versions
npm run watch               # Watch for changes
npm run lint                # Lint markdown files
npm run lint:fix            # Auto-fix linting issues
```

---

## 📊 Repositories Scanned

This system scans the following DVWDesign repositories:

| Repository | Priority | Active | Location |
|-----------|----------|--------|----------|
| FigmaAPI/FigmailAPP | High | ✅ | `/Users/Shared/htdocs/github/DVWDesign/FigmaAPI/FigmailAPP` |
| FigmaAPI/FigmaDSController | High | ✅ | `/Users/Shared/htdocs/github/DVWDesign/FigmaAPI/FigmaDSController` |
| FigmaAPI/@figma-core | High | ✅ | `/Users/Shared/htdocs/github/DVWDesign/FigmaAPI/@figma-core` |
| FigmaAPI/@figma-docs | High | ✅ | `/Users/Shared/htdocs/github/DVWDesign/FigmaAPI/@figma-docs` |
| Figma-Plug-ins | High | ✅ | `/Users/Shared/htdocs/github/DVWDesign/Figma-Plug-ins` |
| GlossiaApp | Medium | ✅ | `/Users/Shared/htdocs/github/DVWDesign/GlossiaApp` |
| Contentful | Medium | ✅ | `/Users/Shared/htdocs/github/DVWDesign/Contentful` |
| IconJar | Low | ✅ | `/Users/Shared/htdocs/github/DVWDesign/IconJar` |
| AdobePlugIns | Low | ✅ | `/Users/Shared/htdocs/github/DVWDesign/AdobePlugIns` |
| Markdown | High | ✅ | `/Users/Shared/htdocs/github/DVWDesign/Markdown` |

---

## 🛠️ Scripts

### Core Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `npm run scan` | Scan all repositories | `index/all-markdown-files.json` |
| `npm run scan:report` | Generate detailed scan report | `index/scan-report.md` |
| `npm run index` | Create organized index | `index/organized-index.md` |
| `npm run index:update` | Update existing index | Updates `organized-index.md` |
| `npm run validate` | Validate timestamps/versions | `index/validation-report.md` |
| `npm run validate:fix` | Auto-fix validation issues | Updates markdown files |
| `npm run watch` | Watch for changes | Auto-updates on file changes |
| `npm run lint` | Lint markdown files | Console output |
| `npm run lint:fix` | Auto-fix markdown issues | Updates files in-place |
| `npm run fix` | Fix systematic errors | Updates current directory |
| `npm run fix:all` | Fix all repositories | Updates all repo markdown |
| `npm run cron:setup` | Setup automated cron jobs | Cron configuration |
| `npm run cron:stop` | Stop cron jobs | Stops automation |

### scan-all-repos.mjs

Scans all DVWDesign repositories for markdown files and generates comprehensive index.

**Output:**

- `index/all-markdown-files.json` - Complete scan data
- `index/scan-report.md` - Human-readable report

**Features:**

- Extracts frontmatter metadata
- Analyzes file structure (headings, lines, size)
- Detects timestamps, versions, Claude markers
- Groups by repository

**Usage:**

```bash
npm run scan              # Scan only
npm run scan:report       # Scan + generate report
```

### index-markdown.mjs

Creates organized searchable index from scan results.

**Output:**

- `index/organized-index.md` - Organized by category
- `index/categories.json` - JSON categories

**Categories:**

- AI Agents
- Documentation
- Guides
- Architecture
- Backend
- Frontend
- Shared Resources
- README Files
- Claude Instructions
- Other

**Usage:**

```bash
npm run index             # Requires scan first
```

### validate-timestamps.mjs

Validates markdown files for missing timestamps, versions, and metadata.

**Output:**

- `index/validation-report.md` - Validation report

**Checks:**

- Missing timestamp
- Missing version
- Missing Claude marker
- Recently modified files without timestamps

**Usage:**

```bash
npm run validate          # Requires scan first
```

### watch-and-index.mjs

Watches for markdown file changes and auto-updates index.

**Features:**

- Watches all DVWDesign repositories
- Debounces updates (5 seconds)
- Auto-runs scan + index on changes

**Usage:**

```bash
npm run watch             # Press Ctrl+C to stop
```

### fix-markdown.mjs

Automatically fixes systematic markdown linting errors.

**Fixes:**

- Line breaks around block elements
- Empty code block language identifiers
- Bold/italic text that should be headings

**Usage:**

```bash
npm run fix               # Fix current directory
npm run fix:all           # Fix all repositories
node scripts/fix-markdown.mjs --dry-run   # Preview
```

---

## 📋 Markdown Linting Rules

Configuration: `config/.markdownlint.json`

**Enforced Rules:**

- MD001: Heading levels increment by one
- MD003: ATX-style headings (`#` not underline)
- MD022: Blank lines around headings
- MD031: Blank lines around fenced code blocks
- MD032: Blank lines around lists
- MD040: **GLOBAL POLICY** - ALL code blocks MUST have type

**Relaxed Rules:**

- MD013: Line length (disabled for links)
- MD033: Inline HTML (allows specific tags)

**Usage:**

```bash
npm run lint              # Check all markdown
npm run lint:fix          # Auto-fix issues
```

---

## 🤖 Agent Integration

### markdown-fixer Agent

Location: `.claude/agents/markdown-fixer.md`

**Purpose:** Automatically fixes systematic markdown linting errors across all repositories.

**Triggers:**

- `@markdown-fixer`
- Markdown lint errors
- Markdown validation

**Capabilities:**

- Cross-repository analysis
- Systematic error auto-fix
- Context-aware fixes
- Intelligent code block detection

**Usage in Claude Code:**

```text
@markdown-fixer fix all repositories
@markdown-fixer validate timestamps
@markdown-fixer generate report
```

---

## 📚 Workflow Examples

### Example 1: Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Run initial scan
npm run scan:report

# 3. Create organized index
npm run index

# 4. Validate timestamps
npm run validate

# 5. Review reports
cat index/scan-report.md
cat index/validation-report.md
```

### Example 2: Daily Maintenance

```bash
# Run watcher (leave running)
npm run watch
```

### Example 3: Fix Linting Issues

```bash
# 1. Check for issues
npm run lint

# 2. Preview fixes
node scripts/fix-markdown.mjs --dry-run .

# 3. Apply fixes
npm run lint:fix

# 4. Verify
npm run lint
```

### Example 4: Cross-Repository Analysis

```bash
# 1. Scan all repositories
npm run scan:report

# 2. Review largest files
grep "Largest Files" index/scan-report.md

# 3. Check for missing timestamps
npm run validate

# 4. Review validation report
cat index/validation-report.md
```

---

## 🔗 Integration Points

### With @figma-docs

- Uses same `@figma-core` agent infrastructure (symlinked)
- Complements documentation sync system
- Provides markdown quality assurance

### With FigmailAPP

- Ports proven markdown infrastructure
- Uses same linting configuration
- Shares markdown-fixer agent logic

### With All Repositories

- Scans all for markdown files
- Validates all for consistency
- Fixes all systematically

---

## 📊 Generated Outputs

All outputs are in `index/` (gitignored):

| File | Purpose | Generated By |
|------|---------|-------------|
| `all-markdown-files.json` | Complete scan data | `npm run scan` |
| `scan-report.md` | Human-readable scan report | `npm run scan:report` |
| `organized-index.md` | Categorized file index | `npm run index` |
| `categories.json` | JSON categories | `npm run index` |
| `validation-report.md` | Timestamp/version validation | `npm run validate` |

---

## 🎯 Best Practices

1. **Run Scan Regularly**
   - Use `npm run watch` for continuous monitoring
   - Or run `npm run scan` weekly

2. **Validate Before Committing**
   - Always run `npm run lint` before git commit
   - Fix issues with `npm run lint:fix`

3. **Check Validation Reports**
   - Review `index/validation-report.md` monthly
   - Fix missing timestamps/versions

4. **Use Agent for Complex Fixes**
   - Use `@markdown-fixer` in Claude Code
   - Let agent handle context-dependent issues

5. **Keep Index Updated**
   - Use `npm run watch` when actively working
   - Or run `npm run index` after major changes

---

## 🔧 Configuration

### Add New Repository

Edit `scripts/scan-all-repos.mjs`:

```javascript
const REPOS = [
  // ... existing repos
  { name: 'NewRepo', priority: 'medium', active: true },
];
```

### Customize Linting Rules

Edit `config/.markdownlint.json`:

```json
{
  "MD040": true,  // Enforce code block types
  "MD013": false  // Disable line length
}
```

### Adjust Watch Debounce

Edit `scripts/watch-and-index.mjs`:

```javascript
const DEBOUNCE_MS = 5000; // 5 seconds (adjust as needed)
```

---

## 📞 Quick Reference

| Task | Command |
|------|---------|
| Install | `npm install` |
| Scan all repos | `npm run scan` |
| Generate report | `npm run scan:report` |
| Create index | `npm run index` |
| Validate files | `npm run validate` |
| Watch for changes | `npm run watch` |
| Lint markdown | `npm run lint` |
| Auto-fix lint | `npm run lint:fix` |
| Fix specific file | `node scripts/fix-markdown.mjs path/to/file.md` |
| Preview fixes | `node scripts/fix-markdown.mjs --dry-run .` |

---

## 🚨 Troubleshooting

### Error: "all-markdown-files.json not found"

**Solution:** Run `npm run scan` first

### Error: "Repository not found"

**Solution:** Verify repository exists at expected location in `scripts/scan-all-repos.mjs`

### Linting not catching errors

**Solution:** Check `.markdownlint.json` configuration, ensure VSCode extension uses same config

### Watcher not detecting changes

**Solution:** Check file is not in `IGNORE_PATTERNS`, restart watcher

---

**Version:** 1.0.0
**Last Updated:** 2025-11-06
**Status:** ✅ Production Ready
