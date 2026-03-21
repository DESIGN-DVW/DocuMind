# Cron Setup Guide - Markdown Management

**Version:** 1.0.0
**Created:** 2025-11-06

Complete guide for setting up automated markdown scanning and indexing via cron jobs.

---

## Quick Start

```bash
# Install cron jobs
npm run cron:setup

# View installed jobs
crontab -l

# View logs
tail -f logs/cron-*.log

# Stop cron jobs
npm run cron:stop
```

---

## Scheduled Jobs

The system installs the following cron jobs:

| Job | Schedule | Frequency | Command | Log File |
| ----- | ---------- | ----------- | --------- | ---------- |
| **Scan** | `0 * * * *` | Every hour | `npm run scan:report` | `logs/cron-markdown-scan-hourly.log` |
| **Index** | `5 * * * *` | Every hour (+5min) | `npm run index` | `logs/cron-markdown-index-hourly.log` |
| **Validate** | `0 9 * * *` | Daily at 9:00 AM | `npm run validate` | `logs/cron-markdown-validate-daily.log` |
| **Lint** | `0 10 * * *` | Daily at 10:00 AM | `npm run lint` | `logs/cron-markdown-lint-daily.log` |

### Schedule Explanation

**Cron Format:** `minute hour day month weekday`

- `0 * * * *` = Every hour at minute 0
- `5 * * * *` = Every hour at minute 5
- `0 9 * * *` = Every day at 9:00 AM
- `0 10 * * *` = Every day at 10:00 AM

---

## Installation

### Step 1: Install Dependencies

```bash
cd /Users/Shared/htdocs/github/DVWDesign/Markdown
npm install
```

### Step 2: Test Scripts Manually

Before setting up cron jobs, test each script manually:

```bash
# Test scan
npm run scan:report

# Test index (requires scan first)
npm run index

# Test validate (requires scan first)
npm run validate

# Test lint
npm run lint
```

## Step 3: Install Cron Jobs

```bash
npm run cron:setup
```

This will:

- Create `logs/` directory
- Add cron jobs to your crontab
- Display confirmation of installed jobs

### Step 4: Verify Installation

```bash
# View crontab
crontab -l | grep -A 20 "DVWDesign Markdown"

# Check logs directory
ls -la logs/

# Wait for first run and check logs
tail -f logs/cron-markdown-scan-hourly.log
```

## Management

### View Installed Jobs

```bash
# List all cron jobs
crontab -l

# List only markdown jobs
node scripts/setup-cron.mjs --list
```

## View Logs

```bash
# Watch all logs in real-time
tail -f logs/cron-*.log

# View specific log
tail -f logs/cron-markdown-scan-hourly.log

# View last 100 lines
tail -n 100 logs/cron-markdown-scan-hourly.log

# Search logs for errors
grep -i error logs/*.log
```

## Rotate Logs

Logs will grow over time. Rotate them periodically:

```bash
# Archive old logs
cd /Users/Shared/htdocs/github/DVWDesign/Markdown
mkdir -p logs/archive
mv logs/*.log logs/archive/$(date +%Y-%m-%d)/ 2>/dev/null || true

# Or truncate logs
truncate -s 0 logs/*.log
```

## Stop Cron Jobs

```bash
# Remove all markdown cron jobs
npm run cron:stop

# Verify removal
crontab -l | grep markdown
# (should show nothing)
```

## Customization

### Modify Schedule

Edit `scripts/setup-cron.mjs`:

```javascript
const CRON_JOBS = [
  {
    name: 'markdown-scan-hourly',
    schedule: '0 */2 * * *', // Every 2 hours instead
    command: 'scan:report',
    description: 'Scan all repositories for markdown files',
  },
  // ... other jobs
];
```

Then reinstall:

```bash
npm run cron:setup
```

### Add New Job

Edit `scripts/setup-cron.mjs`:

```javascript
const CRON_JOBS = [
  // ... existing jobs
  {
    name: 'markdown-cleanup-weekly',
    schedule: '0 0 * * 0', // Weekly on Sunday at midnight
    command: 'cleanup',
    description: 'Clean up old indexes weekly',
  },
];
```

Create the corresponding npm script in `package.json`:

```json
{
  "scripts": {
    "cleanup": "node scripts/cleanup.mjs"
  }
}
```

Then reinstall:

```bash
npm run cron:setup
```

## Common Cron Schedules

```text
# Every minute
* * * * *

# Every 5 minutes
*/5 * * * *

# Every 15 minutes
*/15 * * * *

# Every 30 minutes
*/30 * * * *

# Every hour
0 * * * *

# Every 2 hours
0 */2 * * *

# Every day at 9:00 AM
0 9 * * *

# Every day at 6:00 PM
0 18 * * *

# Every Monday at 9:00 AM
0 9 * * 1

# Every Sunday at midnight
0 0 * * 0

# First day of every month at 9:00 AM
0 9 1 * *
```

## Troubleshooting

### Jobs Not Running

**Check if cron is active:**

```bash
# macOS
sudo launchctl list | grep cron

# Linux
systemctl status cron
```

**Check crontab syntax:**

```bash
crontab -l
```

**Check logs:**

```bash
# System cron log (macOS)
log show --predicate 'process == "cron"' --last 1h

# Linux
grep CRON /var/log/syslog
```

## Scripts Failing

**Run script manually to see errors:**

```bash
cd /Users/Shared/htdocs/github/DVWDesign/Markdown
npm run scan:report
```

**Check script permissions:**

```bash
ls -la scripts/*.mjs
# Should show: -rwxr-xr-x
```

**Check Node.js is in PATH:**

```bash
which node
# Should show: /usr/local/bin/node or similar
```

## Logs Not Created

**Check logs directory exists:**

```bash
ls -la logs/
```

**Create manually if needed:**

```bash
mkdir -p logs
chmod 755 logs
```

**Check disk space:**

```bash
df -h
```

### Environment Variables

Cron runs with limited environment. If scripts need specific environment variables:

#### Option 1: Add to crontab

```bash
crontab -e
```

Add at top:

```text
PATH=/usr/local/bin:/usr/bin:/bin
NODE_ENV=production
```

#### Option 2: Source profile in cron command

Edit `scripts/setup-cron.mjs`:

```javascript
function generateCronEntry(job) {
  return `${job.schedule} source ~/.zshrc && cd ${REPO_ROOT} && npm run ${job.command}`;
}
```

## Alternative: Launchd (macOS)

On macOS, you can use `launchd` instead of cron:

### Create LaunchAgent

Create `~/Library/LaunchAgents/com.dvwdesign.markdown-scan.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dvwdesign.markdown-scan</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npm</string>
        <string>run</string>
        <string>scan:report</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/Shared/htdocs/github/DVWDesign/Markdown</string>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>StandardOutPath</key>
    <string>/Users/Shared/htdocs/github/DVWDesign/Markdown/logs/launchd-scan.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/Shared/htdocs/github/DVWDesign/Markdown/logs/launchd-scan-error.log</string>
</dict>
</plist>
```

### Load LaunchAgent

```bash
launchctl load ~/Library/LaunchAgents/com.dvwdesign.markdown-scan.plist
launchctl start com.dvwdesign.markdown-scan
```

### Verify

```bash
launchctl list | grep markdown
```

## Best Practices

### 1. Monitor Logs Regularly

Set up log monitoring:

```bash
# Add to .zshrc or .bashrc
alias markdown-logs='tail -f ~/path/to/Markdown/logs/cron-*.log'
```

## 2. Set Up Alerts

Create a monitoring script:

```bash
#!/bin/bash
# scripts/check-cron-health.sh

LOGS_DIR="logs"
ALERT_EMAIL="your-email@example.com"

# Check for errors in last hour
ERRORS=$(grep -i error "$LOGS_DIR"/*.log | tail -10)

if [ -n "$ERRORS" ]; then
  echo "Cron job errors detected:" | mail -s "Markdown Cron Alert" "$ALERT_EMAIL"
  echo "$ERRORS" | mail -s "Markdown Cron Alert" "$ALERT_EMAIL"
fi
```

## 3. Test Before Deploy

Always test cron jobs manually before scheduling:

```bash
# Test each command
npm run scan:report
npm run index
npm run validate
npm run lint
```

## 4. Use Absolute Paths

Cron runs with limited PATH. Always use absolute paths in scripts.

### 5. Redirect Output

All cron commands redirect to log files. Never rely on email output.

## Quick Reference

| Task | Command |
| ------ | --------- |
| Install cron jobs | `npm run cron:setup` |
| Remove cron jobs | `npm run cron:stop` |
| List jobs | `node scripts/setup-cron.mjs --list` |
| View crontab | `crontab -l` |
| Edit crontab manually | `crontab -e` |
| View all logs | `tail -f logs/cron-*.log` |
| View scan log | `tail -f logs/cron-markdown-scan-hourly.log` |
| Archive logs | `mv logs/*.log logs/archive/` |
| Test scan | `npm run scan:report` |
| Test index | `npm run index` |
| Test validate | `npm run validate` |
| Test lint | `npm run lint` |

**Version:** 1.0.0
**Last Updated:** 2025-11-06
**Status:** ✅ Production Ready
