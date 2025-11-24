# Custom Markdown Error Validation - Usage Guide

**Purpose:** Guide for using custom markdown validation and fixing tools
**Version:** 1.0.0
**Last Updated:** 2025-11-13

---

## Overview

The custom error validation system extends standard markdown linting with pattern-based detection and automated fixes for errors that require:

- Context awareness (parent-child relationships)
- Structural validation (tables, lists, headings)
- File system checks (broken links)
- Complex regex patterns

**What Makes It Different:**

Standard linters like markdownlint focus on single-line rules. This system handles:

- Multi-line patterns (numbered lists breaking across sections)
- Semantic issues (skipped heading levels)
- Structural consistency (table column alignment)
- Repository-wide patterns

---

## Quick Start

### 1. Validate Current Repository

```bash
npm run validate:custom
```text

**Output:**

```text
🔍 Custom Markdown Error Validation
📂 Scanning DocuMind...
   Found 21 markdown files

📋 Custom Markdown Validation Report
📊 Summary:
   Total Issues: 42
   Errors: 35
   Warnings: 7
```text

### 2. Preview Fixes (Dry Run)

```bash
npm run fix:custom:dry-run
```text

**Output:**

```text
🔧 Custom Markdown Error Fix Script
🔍 DRY RUN MODE - No files will be modified

📂 Processing: DocuMind
   ✅ Fixed 21 files:
      docs/MARKDOWN-ERROR-PATTERNS.md
         Fixes: List Indentation, Table Separators
```text

### 3. Apply Fixes

```bash
npm run fix:custom
```text

**Output:**

```text
📊 Summary
Total files processed: 28
Total files fixed: 21
Files with broken links: 1
```text

---

## Available Commands

### Validation

| Command | Description | Output |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| `npm run validate:custom` | Validate current repository | Console report |
| --- | --- | --- |
| --- | --- | --- |
| `npm run validate:custom:all` | Validate all repositories | Cross-repo report |

**Validation Flags:**

```bash
node scripts/validate-custom-errors.mjs --verbose      # Detailed output
node scripts/validate-custom-errors.mjs --category="Code Block"
node scripts/validate-custom-errors.mjs --severity=error
```text

### Fixing

| Command | Description | Action |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| `npm run fix:custom:dry-run` | Preview fixes without changing files | Read-only |
| --- | --- | --- |
| --- | --- | --- |
| `npm run fix:custom` | Apply fixes to current repository | Modifies files |
| --- | --- | --- |
| --- | --- | --- |
| `npm run fix:custom:all` | Apply fixes to all repositories | Modifies all repos |

**Fix Flags:**

```bash
node scripts/fix-custom-errors.mjs --dry-run    # Preview only
node scripts/fix-custom-errors.mjs --all        # All repositories
node scripts/fix-custom-errors.mjs /path/to/repo  # Specific directory
```text

## Error Categories

### 1. Context-Dependent Numbering

**Example Error:**

```markdown
1. First item
2. Second item

Some text

3. Third item  ❌ ERROR: Should restart at 1
```text

**Fix Strategy:** AI-assisted (requires context)

**Why AI-Assisted:**
Need to determine if text should be indented (continuing list) or if list should restart.

### 2. Heading Context

**Example Error:**

```markdown
## Section  (H2)
### Subsection  ❌ ERROR: Skipped H3
```text

**Fix Strategy:** Automated

**What Gets Fixed:**

```markdown
## Section  (H2)
### Subsection  ✅ FIXED: Now H3
```text

### 3. Code Block Issues

**Example Error:**

```markdown
```text

console.log("test");  ❌ ERROR: Missing language

```text
```text

**Fix Strategy:** Automated (already in fix-markdown.mjs)

### 4. Table Formatting

**Example Error:**

```markdown
| Header 1 | Header 2 |
| Data 1   | Data 2   |  ❌ ERROR: Missing separator
```text

**Fix Strategy:** Automated

**What Gets Fixed:**

```markdown
| Header 1 | Header 2 |
| --- | --- |
| Data 1   | Data 2   |  ✅ FIXED: Separator added
```text

### 5. Whitespace Issues

**Example Error:**

```markdown
This line has trailing spaces   ❌
```text

**Fix Strategy:** Automated

**What Gets Fixed:**

```markdown
This line has no trailing spaces ✅
```text

## Understanding Fix Strategies

### Automated Fixes

**What Gets Auto-Fixed:**

- ✅ Trailing whitespace
- ✅ List indentation (standardized to 2 spaces)
- ✅ Table separators (missing |---|---|)
- ✅ Table column alignment
- ✅ Skipped heading levels
- ✅ Nested code blocks
- ✅ Excessive horizontal rules (max 3 per document)

**Why These Are Safe:**

These fixes follow clear, unambiguous rules that don't require semantic understanding.

### AI-Assisted Fixes

**What Requires AI/Manual Review:**

- 🤖 Numbered lists breaking context
- 🤖 Multiple H1 headings (which should be primary?)
- 🤖 Undefined reference links (need URL)
- 🤖 Malformed YAML frontmatter
- 🤖 Over-formatted emphasis (heading vs. bold?)

**Why AI Is Needed:**

These require understanding document meaning, author intent, or external information.

## Workflow Examples

### Example 1: Pre-Commit Validation

```bash
# Before committing changes
npm run validate:custom

# If issues found:
npm run fix:custom:dry-run  # Preview fixes
npm run fix:custom          # Apply fixes

# Commit fixed files
git add .
git commit -m "fix: Apply custom markdown fixes"
```text

## Example 2: Repository-Wide Cleanup

```bash
# Validate all repos
npm run validate:custom:all > validation-report.txt

# Review report
cat validation-report.txt

# Fix all repos (if confident)
npm run fix:custom:all
```text

## Example 3: Category-Specific Validation

```bash
# Check only table formatting issues
node scripts/validate-custom-errors.mjs --category="Table Formatting"

# Check only errors (skip warnings)
node scripts/validate-custom-errors.mjs --severity=error
```text

## Example 4: CI/CD Integration

```bash
# In GitHub Actions workflow
- name: Validate Custom Markdown Patterns
  run: npm run validate:custom
  continue-on-error: false  # Fail build if errors found
```text

## Reading Validation Reports

### Sample Output

```text
📋 Custom Markdown Validation Report

📊 Summary:
   Total Issues: 42
   Errors: 35
   Warnings: 7

📂 Code Block (12 issues)
   README.md:
     ✗ Line 45 - Code Block Without Language
        Code block missing language specifier
        Fix: automated

📂 Table Formatting (18 issues)
   docs/GUIDE.md:
     ✗ Line 120 - Table Without Header Separator
        Missing |---|---| separator line
        Fix: automated

📂 Heading Context (12 issues)
   CLAUDE.md:
     ✗ Line 89 - Skipped Heading Levels
        Jumping heading levels (e.g., H2 to H4)
        Fix: automated
```text

### Understanding Report Sections

- **Total Issues**: All problems found
- **Errors**: Must fix (breaks rendering)
- **Warnings**: Should fix (suboptimal formatting)
- **Fix Strategy**: How issue should be resolved
  - `automated`: Run fix script
  - `ai-assisted`: Use agent or manual review

## Integration with Existing Workflow

### With Standard Linting

```bash
# Run both linters
npm run lint              # Standard markdownlint
npm run validate:custom   # Custom patterns

# Fix both
npm run lint:fix          # Standard fixes
npm run fix:custom        # Custom fixes
```text

## With Pre-Commit Hooks

Add to `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Standard linting
npx lint-staged

# Custom validation (optional - can be slow)
# npm run validate:custom
```text

## With VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "label": "Validate Custom Errors",
  "type": "shell",
  "command": "npm run validate:custom",
  "group": "test",
  "presentation": {
    "reveal": "always",
    "panel": "new"
  }
}
```text

## Troubleshooting

### Issue: Too Many False Positives

**Problem:** Validation reports errors that aren't real issues

**Solution:** The YAML frontmatter detection is currently overly aggressive. The validation script matches `---` as potential YAML, including horizontal rules in documents.

**Workaround:**

```bash
# Filter out frontmatter warnings
npm run validate:custom | grep -v "Malformed YAML"

# Or fix the pattern in config/custom-error-patterns.json
```text

## Issue: Fixes Break Valid Markdown

**Problem:** Auto-fix changes something that was intentionally formatted

**Solution:**

1. Always use `--dry-run` first
2. Review changes before committing
3. Use git to review diffs: `git diff`
4. If a pattern shouldn't be fixed, add to exclusion list

### Issue: Broken Link Detection Incorrect

**Problem:** Links reported as broken that actually exist

**Root Cause:** Path resolution issue (relative vs. absolute)

**Solution:**
Check the actual file path. The validation uses path resolution relative to the markdown file location.

### Issue: Script Performance on Large Repos

**Problem:** Validation/fixing takes too long

**Solution:**

```bash
# Validate specific directory only
node scripts/validate-custom-errors.mjs docs/

# Use category filter
npm run validate:custom -- --category="Code Block"

# Or exclude large repos from --all
```text

## Best Practices

### 1. Always Dry-Run First

```bash
# ✅ Good
npm run fix:custom:dry-run
# Review output
npm run fix:custom

# ❌ Bad
npm run fix:custom:all  # Without checking
```text

## 2. Validate Before Committing

```bash
# Add to workflow
npm run validate:custom
npm run fix:custom
git add .
git commit -m "fix: markdown errors"
```text

## 3. Review AI-Assisted Issues Manually

```bash
# Validate and filter for AI-assisted only
npm run validate:custom | grep "ai-assisted"

# Review these in editor with context
```text

## 4. Use Category Filters for Large Repos

```bash
# Focus on high-priority issues
npm run validate:custom -- --severity=error

# Or specific categories
npm run validate:custom -- --category="Code Block"
```text

## 5. Combine with Standard Linting

```bash
# Run both
npm run lint && npm run validate:custom

# Fix both
npm run lint:fix && npm run fix:custom
```text

## Configuration

### Adding New Patterns

Edit `config/custom-error-patterns.json`:

```json
{
  "patterns": [
    {
      "id": "new-pattern-1",
      "category": "Custom Category",
      "name": "Pattern Name",
      "description": "What it detects",
      "severity": "error",
      "regex": "your-regex-here",
      "flags": "gm",
      "fixStrategy": "automated",
      "fixDescription": "How to fix"
    }
  ]
}
```text

### Adjusting Fix Behavior

Edit `scripts/fix-custom-errors.mjs`:

```javascript
// Change max horizontal rules
const maxHR = 3;  // Change to 5

// Disable specific fixes
const fixFunctions = [
  // { name: 'Table Separators', fn: fixTableSeparators }, // Commented out
  { name: 'Trailing Spaces', fn: fixTrailingSpaces },
];
```text

### Excluding Repositories

Edit `scripts/fix-custom-errors.mjs`:

```javascript
const CONFIG = {
  repositories: [
    'DocuMind',
    // 'GlossiaApp',  // Excluded
  ],
};
```text

## Advanced Usage

### Using with Bash Pipelines

```bash
# Find files with most issues
npm run validate:custom | grep "Total Issues" | sort -rn

# Count issues by category
npm run validate:custom | grep "📂" | sort | uniq -c

# Extract all error lines
npm run validate:custom | grep "✗ Line" > errors.txt
```text

## Batch Processing

```bash
# Fix all repositories in sequence
for repo in DocuMind RootDispatcher GlossiaApp; do
  echo "Fixing $repo..."
  node scripts/fix-custom-errors.mjs /path/to/$repo
done
```text

## Integration with CI/CD

```yaml
# GitHub Actions
- name: Validate Custom Patterns
  run: |
    npm install
    npm run validate:custom
  continue-on-error: false

- name: Auto-fix Issues
  run: npm run fix:custom
  if: github.event_name == 'pull_request'

- name: Commit Fixes
  run: |
    git config user.name "GitHub Actions"
    git add .
    git commit -m "fix: Auto-fix custom markdown errors" || true
    git push
```text

## FAQ

**Q: Can I run validation on files outside the repository?**

A: Yes, pass the directory path:

```bash
node scripts/validate-custom-errors.mjs /path/to/external/docs
```text

**Q: How do I add a new fix function?**

A: Edit `scripts/fix-custom-errors.mjs` and add your function to the `fixFunctions` array.

**Q: What's the difference between this and markdownlint?**

A: Markdownlint handles single-line syntax rules. This system handles multi-line patterns, structural issues, and context-aware validation.

**Q: Can I disable specific fixes?**

A: Yes, comment out the fix function in the `fixFunctions` array in `fix-custom-errors.mjs`.

**Q: How do I test a new pattern before adding it?**

A: Use grep directly:

```bash
grep -Pzo 'your-regex' docs/*.md
```text

## Related Documentation

- [MARKDOWN-ERROR-PATTERNS.md](MARKDOWN-ERROR-PATTERNS.md) - Complete pattern catalog
- [CUSTOM-ERROR-SYSTEM-PROGRESS.md](CUSTOM-ERROR-SYSTEM-PROGRESS.md) - Implementation status
- [config/custom-error-patterns.json](../config/custom-error-patterns.json) - Pattern definitions

## Support

**Issues:** Report bugs in the pattern definitions or scripts

**Questions:** Review [MARKDOWN-ERROR-PATTERNS.md](MARKDOWN-ERROR-PATTERNS.md) for pattern details

**Contributing:** Add new patterns by editing `config/custom-error-patterns.json`

**Version:** 1.0.0
**Status:** ✅ Production Ready
**Last Updated:** 2025-11-13
