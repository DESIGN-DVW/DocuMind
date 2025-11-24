# Recommended Tooling Additions for DocuMind

**Purpose:** Enhance documentation capabilities with additional tools and automation
**Last Updated:** 2025-11-13

---

## Priority 1: Essential Additions (High Impact)

### 1. Git Pre-Commit Hooks (Husky)

**What it does:** Automatically runs linting before commits

**Benefits:**

- Prevents committing invalid markdown
- Auto-fixes issues before commit
- Ensures all commits pass validation

**Installation:**

```bash
npm install --save-dev husky lint-staged

# Initialize husky
npx husky init

# Add pre-commit hook
echo "npx lint-staged" > .husky/pre-commit
chmod +x .husky/pre-commit
```

**Add to package.json:**

```json
{
  "lint-staged": {
    "**/*.md": [
      "markdownlint-cli2 --fix",
      "git add"
    ],
    "**/*.{js,mjs,json}": [
      "prettier --write",
      "git add"
    ]
  }
}
```

**Impact:** 🔥 High - Prevents bad commits

---

## 2. Mermaid Diagram Support

**What it does:** Create diagrams from text in markdown

**Benefits:**

- Create flowcharts, sequences, class diagrams
- Version-controlled (text-based)
- Renders in GitHub, VS Code

**Installation:**

```bash
npm install --save-dev @mermaid-js/mermaid-cli
```

**Usage in markdown:**

\`\`\`mermaid
graph TD
    A[DocuMind] --> B[Scan Repos]
    B --> C[Generate Index]
    C --> D[Validate]
    D --> E[Fix Issues]
\`\`\`

**Generate PNG/SVG:**

```bash
npx mmdc -i docs/diagram.md -o docs/diagram.png
```

**Impact:** 🔥 High - Visual documentation

---

### 3. Link Checker

**What it does:** Validates all links (internal & external)

**Benefits:**

- Catches broken links
- Validates cross-repo references
- Checks external URLs

**Installation:**

```bash
npm install --save-dev markdown-link-check
```

**Add script to package.json:**

```json
{
  "scripts": {
    "links:check": "find . -name '*.md' -not -path './node_modules/*' -not -path './index/*' | xargs markdown-link-check"
  }
}
```

**Impact:** 🔥 High - Prevents broken links

### 4. VS Code Tasks for Auto-Run

**What it does:** Run tasks automatically when VS Code opens

**Benefits:**

- Auto-start watcher
- Auto-run validation
- Background processes

**Create `.vscode/tasks.json`:**

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Watch Markdown Changes",
      "type": "shell",
      "command": "npm run watch",
      "isBackground": true,
      "problemMatcher": [],
      "runOptions": {
        "runOn": "folderOpen"
      }
    },
    {
      "label": "Validate Markdown on Save",
      "type": "shell",
      "command": "npm run lint",
      "group": "build",
      "presentation": {
        "reveal": "silent"
      }
    }
  ]
}
```

**Impact:** 🔥 High - Automation

### 5. Documentation Website (VitePress)

**What it does:** Generates beautiful static documentation site

**Benefits:**

- Professional documentation site
- Auto-deploys to GitHub Pages
- Full-text search
- Mobile-friendly

**Installation:**

```bash
npm install --save-dev vitepress
```

**Setup:**

```bash
mkdir -p docs/.vitepress
```

**Add to package.json:**

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs",
    "docs:deploy": "npm run docs:build && gh-pages -d docs/.vitepress/dist"
  }
}
```

**Impact:** 🔥🔥 Very High - Professional site

## Priority 2: Quality Improvements

### 6. Prettier (Code Formatting)

**What it does:** Auto-formats JavaScript, JSON, Markdown

**Installation:**

```bash
npm install --save-dev prettier
```

**Create `.prettierrc.json`:**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "proseWrap": "always"
}
```

**Add to package.json:**

```json
{
  "scripts": {
    "format": "prettier --write '**/*.{js,mjs,json,md}'",
    "format:check": "prettier --check '**/*.{js,mjs,json,md}'"
  }
}
```

**Impact:** 🔥 High - Consistency

### 7. Spell Checker (cSpell)

**What it does:** Catches typos in documentation

**Installation:**

```bash
npm install --save-dev cspell
```

**Create `cspell.json`:**

```json
{
  "version": "0.2",
  "language": "en",
  "words": [
    "DocuMind",
    "DVWDesign",
    "DESIGN-DVW",
    "FigmailAPP",
    "markdownlint",
    "GitLens"
  ],
  "ignorePaths": [
    "node_modules/**",
    "index/**",
    "*.log"
  ]
}
```

**Add to package.json:**

```json
{
  "scripts": {
    "spell:check": "cspell '**/*.md'"
  }
}
```

**Impact:** 🔥 Medium - Quality

### 8. Table of Contents Generator

**What it does:** Auto-generates TOC for markdown files

**Installation:**

```bash
npm install --save-dev markdown-toc
```

**Add to package.json:**

```json
{
  "scripts": {
    "toc:generate": "markdown-toc -i README.md",
    "toc:all": "find . -name '*.md' -not -path './node_modules/*' -exec markdown-toc -i {} \\;"
  }
}
```

**Impact:** 🔥 Medium - Navigation

## Priority 3: Advanced Features

### 9. PDF Generation (Pandoc)

**What it does:** Converts markdown to PDF

**Installation:**

```bash
brew install pandoc
brew install --cask basictex  # LaTeX for PDF
```

**Add to package.json:**

```json
{
  "scripts": {
    "pdf:generate": "pandoc README.md -o README.pdf --pdf-engine=xelatex",
    "pdf:all": "node scripts/generate-all-pdfs.mjs"
  }
}
```

**Impact:** 🔥 Medium - Export

### 10. Readability Metrics

**What it does:** Analyzes documentation readability

**Installation:**

```bash
npm install --save-dev text-readability
```

**Create script `scripts/readability-check.mjs`:**

```javascript
import { readFileSync } from 'fs';
import { fleschReadingEase, fleschKincaidGrade } from 'text-readability';

const content = readFileSync('README.md', 'utf8');
console.log('Flesch Reading Ease:', fleschReadingEase(content));
console.log('Grade Level:', fleschKincaidGrade(content));
```

**Impact:** 🔥 Low - Analytics

### 11. Documentation Changelog Generator

**What it does:** Auto-generates changelog from git commits

**Installation:**

```bash
npm install --save-dev conventional-changelog-cli
```

**Add to package.json:**

```json
{
  "scripts": {
    "changelog:generate": "conventional-changelog -p angular -i CHANGELOG.md -s"
  }
}
```

**Impact:** 🔥 Medium - Tracking

### 12. MCP Server Integration

**What it does:** Connect to Figma, Notion, other tools

**Setup Figma MCP:**

```bash
# Install Figma MCP server
npm install -g @anthropic-ai/mcp-server-figma
```

**Add to Claude Code config:**

```json
{
  "mcpServers": {
    "figma": {
      "command": "mcp-server-figma",
      "env": {
        "FIGMA_TOKEN": "your-token"
      }
    }
  }
}
```

**Impact:** 🔥🔥 High - Integration

## Priority 4: Automation & CI/CD

### 13. GitHub Actions

**What it does:** Auto-runs validation on push

**Create `.github/workflows/validate-docs.yml`:**

```yaml
name: Validate Documentation

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-node@v3
        with:
          node-version: '20'
  - run: npm install
  - run: npm run lint
  - run: npm run validate
  - run: npm run links:check
```

**Impact:** 🔥🔥 Very High - Quality

### 14. Automated Deployment

**What it does:** Auto-deploy docs to GitHub Pages

**Create `.github/workflows/deploy-docs.yml`:**

```yaml
name: Deploy Documentation

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-node@v3
  - run: npm install
  - run: npm run docs:build
  - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/.vitepress/dist
```

**Impact:** 🔥🔥 Very High - Publishing

## Summary of Recommended Tools

| Tool | Priority | Impact | Effort | Status |
|------|----------|--------|--------|--------|
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **Husky (Git Hooks)** | P1 | 🔥🔥🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **Mermaid Diagrams** | P1 | 🔥🔥🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **Link Checker** | P1 | 🔥🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **VS Code Tasks** | P1 | 🔥🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **VitePress** | P1 | 🔥🔥🔥 | Medium | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **Prettier** | P2 | 🔥🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **cSpell** | P2 | 🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **TOC Generator** | P2 | 🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **Pandoc/PDF** | P3 | 🔥 | Medium | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **Readability** | P3 | 🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **Changelog** | P3 | 🔥 | Low | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **MCP Integration** | P3 | 🔥🔥 | High | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **GitHub Actions** | P4 | 🔥🔥🔥 | Medium | Not installed |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| --- | --- | --- | --- | --- |
| **Auto-Deploy** | P4 | 🔥🔥 | Medium | Not installed |

## Quick Install: Priority 1 Tools

To install all Priority 1 tools at once:

```bash
# Install dependencies
npm install --save-dev \
  husky \
  lint-staged \
  @mermaid-js/mermaid-cli \
  markdown-link-check \
  vitepress

# Setup husky
npx husky init
echo "npx lint-staged" > .husky/pre-commit
chmod +x .husky/pre-commit

# Add scripts to package.json (manually or use script)
```

## What to Install First?

**My Recommendation:**

1. **Start with:** Husky + Link Checker + VS Code Tasks
   - Time: 15 minutes
   - Impact: Immediate quality improvement

2. **Then add:** VitePress
   - Time: 30 minutes
   - Impact: Professional documentation site

3. **Finally:** GitHub Actions
   - Time: 20 minutes
   - Impact: Full automation

**Total time to full setup:** ~1-2 hours

**Version:** 1.0.0
**Last Updated:** 2025-11-13
