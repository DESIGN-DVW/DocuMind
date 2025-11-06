---
name: markdown-fixer
description: Automatically fixes systematic markdown linting errors across all DVWDesign repositories
version: 1.0.0
created: 2025-11-06
updated: 2025-11-06
status: active
tools:
  - Read
  - Edit
  - Write
  - Bash
  - Glob
  - Grep
triggers:
  - "@markdown-fixer"
  - markdown lint errors
  - markdown validation
---

# Markdown Fixer Agent (Cross-Repository Version)

**Purpose**: Automatically detect and fix markdown linting errors across all DVWDesign repositories.

## 🎯 Core Responsibilities

### 1. Systematic Error Auto-Fix

Fix repetitive errors that occur across multiple repositories and files:

**A. Line Break Issues (MD031, MD032, MD022)**

- Ensure single blank line before/after lists
- Ensure single blank line before/after fenced code blocks
- Ensure single blank line before/after headings
- **NEVER** double blank lines before block elements

**B. Empty Code Block Language (MD040)**

- All fenced code blocks MUST have a language specified
- Default to `text` if language cannot be determined
- Common mappings:
  - Shell commands → `bash`
  - JSON data → `json`
  - TypeScript → `typescript` or `ts`
  - JavaScript → `javascript` or `js`
  - Plain text → `text`

**C. Bold/Italic as Titles (MD036)**

- Detect bold/italic text that should be proper headings
- Convert to appropriate heading level based on context
- Flag structural issues if heading would be h5 or lower

### 2. Complex Context-Dependent Fixes

**Heading Hierarchy (MD001, MD003)**

- Ensure headings increment properly (h1 → h2 → h3, no skipping)
- Fix heading styles (ATX preferred: `#` not underline style)
- Ensure first line is h1 (MD041)

**Link Validation (MD034)**

- Convert bare URLs to proper markdown links
- Validate internal links point to existing files
- Fix broken anchor links

**List Formatting (MD004, MD005, MD007, MD030)**

- Consistent list marker style
- Proper indentation
- Correct spacing after list markers

### 3. Advanced Operations

**Cross-Repository Analysis**

- Scan all DVWDesign repositories for markdown files
- Generate organization-wide markdown index
- Detect duplicate documentation across repos
- Validate cross-references between repositories

**Intelligent Code Block Detection**

- Analyze code block content to determine language
- Add language identifiers automatically
- Detect missing closing backticks

---

## 🛠️ How to Use

### Basic Commands

```bash
npm run scan                    # Scan all repositories
npm run scan:report             # Generate detailed report
npm run index                   # Create markdown index
npm run fix                     # Fix markdown in current repo
npm run fix:all                 # Fix markdown in all repos
npm run validate                # Validate timestamps/versions
npm run watch                   # Watch for changes
```

### Advanced Commands

```bash
npm run lint                    # Lint all markdown
npm run lint:fix                # Auto-fix markdown issues
node scripts/fix-markdown.mjs --all --dry-run  # Preview fixes
```

---

## 📋 Workflow

### Step 1: Scan All Repositories

```bash
npm run scan
```

This will:
- Scan `/Users/Shared/htdocs/github/DVWDesign/*` for markdown files
- Collect metadata (size, modified date, line count)
- Generate index with cross-repository references

### Step 2: Analyze Error Patterns

```bash
npm run lint
```

This will:
- Run markdownlint on all repositories
- Group errors by type and repository
- Identify systematic vs. one-off issues
- Prioritize fixes by impact

### Step 3: Apply Automatic Fixes

```bash
npm run fix:all --dry-run    # Preview
npm run fix:all              # Execute
```

This handles:
- ✅ Line break normalization
- ✅ Code block language detection
- ✅ Bold/italic to heading conversion

### Step 4: Generate Reports

```bash
npm run scan:report
npm run validate
```

Create detailed reports of:
- Files fixed
- Error types resolved
- Repositories analyzed
- Remaining issues requiring manual review

---

## 🔧 Systematic Error Fixes

### Fix 1: Line Breaks Around Block Elements

**Before:**

```markdown
Some text here.
## Heading

Another paragraph.
- List item 1
- List item 2
Text immediately after.
```

**After:**

```markdown
Some text here.

## Heading

Another paragraph.

- List item 1
- List item 2

Text immediately after.
```

**Rules:**

- Exactly 1 blank line before headings (except h1 at start)
- Exactly 1 blank line after headings
- Exactly 1 blank line before lists
- Exactly 1 blank line after lists
- Exactly 1 blank line before code blocks
- Exactly 1 blank line after code blocks

### Fix 2: Empty Code Block Languages

**Before:**

```markdown
Example code:

<function_calls>
const foo = 'bar';