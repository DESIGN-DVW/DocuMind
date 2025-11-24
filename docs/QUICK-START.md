# Quick Start Guide - Markdown Management

**Version:** 1.0.0
**Created:** 2025-11-06

Get up and running with the DVWDesign Markdown Management System in 5 minutes.

---

## Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn
- Access to DVWDesign repositories

---

## Installation

```bash
cd /Users/Shared/htdocs/github/DVWDesign/Markdown
npm install
```

---

## First Run

### 1. Scan All Repositories

```bash
npm run scan:report
```

This will:

- Scan 10 DVWDesign repositories
- Find all markdown files
- Generate `index/all-markdown-files.json`
- Create `index/scan-report.md`

**Expected output:**

```text
📊 Markdown Repository Scanner
==============================
Found 743 markdown files across 10 repositories
```

### 2. Create Organized Index

```bash
npm run index
```

This will:

- Categorize all markdown files
- Generate `index/organized-index.md`
- Create `index/categories.json`

**Expected output:**

```text
📑 Creating Organized Markdown Index
✓ Organized index saved
✓ Categories saved
```

### 3. Validate Timestamps

```bash
npm run validate
```

This will:

- Check for missing timestamps
- Check for missing versions
- Generate `index/validation-report.md`

**Expected output:**

```text
✅ Validating Markdown Timestamps & Versions
Total Files: 743
Valid Files: 58 (7.8%)
```

## Review Results

```bash
# View scan report
cat index/scan-report.md

# View organized index
cat index/organized-index.md

# View validation report
cat index/validation-report.md
```

## Set Up Automation

### Option 1: File Watcher (Recommended for Development)

```bash
npm run watch
```

Leave this running in a terminal. It will auto-update indexes when you edit markdown files.

Press Ctrl+C to stop.

### Option 2: Cron Jobs (Recommended for Production)

```bash
npm run cron:setup
```

This installs cron jobs that run automatically:

- **Every hour:** Scan and index
- **Daily at 9 AM:** Validate timestamps
- **Daily at 10 AM:** Lint files

View logs:

```bash
tail -f logs/cron-*.log
```

Stop cron jobs:

```bash
npm run cron:stop
```

## Daily Workflow

### Check for Issues

```bash
npm run lint
```

### Fix Issues Automatically

```bash
npm run lint:fix
```

### Update Index Manually

```bash
npm run scan:report && npm run index
```

## Common Tasks

### Find All Markdown Files in a Repository

Check `index/organized-index.md` or `index/all-markdown-files.json`

### Fix Linting Errors

```bash
npm run lint              # Check for errors
npm run lint:fix          # Auto-fix errors
```

### Check Missing Timestamps

```bash
npm run validate
cat index/validation-report.md
```

### Add a New Repository

Edit `scripts/scan-all-repos.mjs`:

```javascript
const REPOS = [
  // ... existing repos
  { name: 'NewRepo', priority: 'medium', active: true },
];
```

Then re-scan:

```bash
npm run scan:report && npm run index
```

## Troubleshooting

### "all-markdown-files.json not found"

**Solution:** Run `npm run scan` first

### "Repository not found"

**Solution:** Check repository path in `scripts/scan-all-repos.mjs`

### Cron jobs not running

**Solution:**

```bash
# Check if installed
npm run cron:list

# Reinstall
npm run cron:setup

# Check logs
tail -f logs/cron-*.log
```

## Scripts failing

**Solution:**

```bash
# Check Node version
node --version  # Should be 20.0.0+

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. **Set up automation** - Choose watcher or cron
2. **Review validation report** - Fix missing timestamps
3. **Fix linting errors** - Run `npm run lint:fix`
4. **Read full documentation** - See [CLAUDE.md](../CLAUDE.md)
5. **Set up cron** - See [CRON-SETUP.md](CRON-SETUP.md)

## Quick Reference

| Task | Command |
|------|---------|
| --- | --- |
| --- | --- |
| --- | --- |
| Scan repositories | `npm run scan:report` |
| --- | --- |
| --- | --- |
| --- | --- |
| Create index | `npm run index` |
| --- | --- |
| --- | --- |
| --- | --- |
| Validate timestamps | `npm run validate` |
| --- | --- |
| --- | --- |
| --- | --- |
| Check linting | `npm run lint` |
| --- | --- |
| --- | --- |
| --- | --- |
| Fix linting | `npm run lint:fix` |
| --- | --- |
| --- | --- |
| --- | --- |
| Watch for changes | `npm run watch` |
| --- | --- |
| --- | --- |
| --- | --- |
| Install cron | `npm run cron:setup` |
| --- | --- |
| --- | --- |
| --- | --- |
| Stop cron | `npm run cron:stop` |
| --- | --- |
| --- | --- |
| --- | --- |
| List cron jobs | `npm run cron:list` |
| --- | --- |
| --- | --- |
| --- | --- |
| View logs | `tail -f logs/cron-*.log` |

**Version:** 1.0.0
**Last Updated:** 2025-11-06
**Status:** ✅ Ready to Use

**Need help?** See [CLAUDE.md](../CLAUDE.md) or [CRON-SETUP.md](CRON-SETUP.md)
