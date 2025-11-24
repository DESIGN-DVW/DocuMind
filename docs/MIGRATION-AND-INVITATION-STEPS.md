# GlossiaApp Migration & User Invitation - Action Steps

**Date:** 2025-11-13
**Status:** Ready to Execute
**Time Required:** ~50 minutes total

---

## Overview

This guide provides exact steps to:

1. **Migrate GlossiaApp** from DVW-Design → DESIGN-DVW (~45 minutes)
2. **Invite <guillaume@aigenconsulting.com>** to DESIGN-DVW (~5 minutes)

---

## Pre-Flight Checklist

### Required Access

- [ ] You have admin access to both DVW-Design and DESIGN-DVW organizations
- [ ] You have owner/admin rights to GlossiaApp repository
- [ ] You are logged into GitHub as an organization admin

### Current State Verification

**GlossiaApp:**

- Current URL: `https://github.com/DVW-Design/GlossiaApp`
- Local path: `/Users/Shared/htdocs/github/DVWDesign/GlossiaApp`
- Current remote: `https://github.com/DVW-Design/GlossiaApp.git`
- Status: Has uncommitted changes (from propagation)

---

## Part 1: Migrate GlossiaApp (45 minutes)

### Step 1: Commit Local Changes (5 minutes)

The propagation script created new files in GlossiaApp. Let's commit them first:

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Check what changed
git status

# Add all propagated files
git add config/constants.mjs
git add scripts/fix-github-org-references.mjs
git add docs/GITHUB-ORGANIZATION-AUDIT-REPORT.md
git add docs/GLOSSIAAPP-MIGRATION-GUIDE.md
git add docs/ORGANIZATION-NAMING-FIX-SUMMARY.md
git add docs/USER-INVITATION-GUIDE.md
git add docs/04-backend/SESSION-SUMMARY-2025-11-12.md

# Add updated files
git add package.json
git add README.md
git add SECURITY.md

# Create commit
git commit -m "$(cat <<'EOF'
feat: Add organization naming fixes and documentation

- Add central configuration (config/constants.mjs)
- Add automated fix script
- Add complete migration and invitation documentation
- Update package.json with DESIGN-DVW organization
- Fix GitHub organization references in README and SECURITY

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Push to current location (DVW-Design)
git push origin main
```text

## Step 2: Create Backup Branch (2 minutes)

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Create backup branch
git checkout -b backup-before-migration
git push origin backup-before-migration

# Return to main
git checkout main

# Verify
git branch
# Should show: main, backup-before-migration
```text

## Step 3: Transfer Repository on GitHub (5 minutes)

**⚠️ IMPORTANT:** This step must be done via GitHub web interface

1. **Open GitHub Settings:**
   - Go to: <https://github.com/DVW-Design/GlossiaApp/settings>
   - Scroll down to "Danger Zone" section

2. **Click "Transfer ownership"**
   - A modal will appear

3. **Enter Transfer Details:**

   ```text
   New owner: DESIGN-DVW
   Repository name: GlossiaApp
   ```

4. **Confirm Transfer:**
   - Type: `DVW-Design/GlossiaApp`
   - Click "I understand, transfer this repository"

5. **Wait for Completion:**
   - GitHub will process the transfer
   - Usually takes 5-30 seconds
   - You'll be redirected to the new URL

**Expected Result:**

- Old URL: `https://github.com/DVW-Design/GlossiaApp` → Redirects automatically
- New URL: `https://github.com/DESIGN-DVW/GlossiaApp` → Repository is here

### Step 4: Update Local Git Remote (3 minutes)

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Update remote URL
git remote set-url origin https://github.com/DESIGN-DVW/GlossiaApp.git

# Verify change
git remote -v
# Should show: https://github.com/DESIGN-DVW/GlossiaApp.git

# Test connection
git fetch origin

# Expected output: Successfully fetched from new URL
```text

## Step 5: Update Branch Tracking (2 minutes)

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Ensure main branch tracks new remote
git branch --set-upstream-to=origin/main main

# Pull to verify
git pull

# Expected output: Already up to date
```text

## Step 6: Verify Migration (3 minutes)

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Verify remote
echo "Remote URL:"
git config --get remote.origin.url
# Should be: https://github.com/DESIGN-DVW/GlossiaApp.git

# Verify connection
echo "Testing fetch:"
git fetch origin

# Verify branches
echo "Branches:"
git branch -a
# Should show both main and backup-before-migration
```text

**Manual Verification:**

1. Visit: <https://github.com/DESIGN-DVW/GlossiaApp>
2. Verify you can see the repository
3. Check that all files are present
4. Verify backup branch exists

## Step 7: Test Old URL Redirect (1 minute)

```bash
# Try accessing old URL
curl -I https://github.com/DVW-Design/GlossiaApp 2>&1 | grep -i location

# Expected: Should redirect to https://github.com/DESIGN-DVW/GlossiaApp
```text

**Or visit in browser:**

- <https://github.com/DVW-Design/GlossiaApp>
- Should automatically redirect to: <https://github.com/DESIGN-DVW/GlossiaApp>

## Migration Complete! ✅

**Result:**

- GlossiaApp now in DESIGN-DVW organization
- Old URL redirects automatically for 90 days
- Local git remote updated
- All history, issues, PRs preserved
- Backup branch created

## Part 2: Invite <guillaume@aigenconsulting.com> (5 minutes)

Now that all repositories are in DESIGN-DVW, invite the user:

### Option A: Via GitHub Web Interface (Easiest)

#### Step 1: Go to Organization People Page

1. Visit: <https://github.com/orgs/DESIGN-DVW/people>
2. You must be logged in as organization owner/admin

#### Step 2: Invite Member

1. Click **"Invite member"** button (top-right)
2. Enter email: `guillaume@aigenconsulting.com`
3. Select role: **"Member"** (recommended)
4. Click **"Send invitation"**

#### Step 3: Confirmation

- User will receive email: "You've been invited to join the DESIGN-DVW organization"
- Email contains invitation link
- Valid for 7 days

#### Step 4: Grant Repository Access (After They Accept)

Once guillaume accepts the invitation:

1. Go to: <https://github.com/DESIGN-DVW/Figma-Plug-ins/settings/access>
2. Click "Add people or teams"
3. Search: `guillaume@aigenconsulting.com`
4. Select permission: **"Read"** (can view and clone)
5. Click "Add to this repository"

**Repeat for any other repositories they need access to:**

- DocuMind (Read)
- GlossiaApp (Read or Write if they work on it)
- FigmailAPP (Write if they contribute)
- etc.

### Option B: Via GitHub CLI (Fastest for Multiple Repos)

```bash
# Install GitHub CLI if needed
# brew install gh

# Authenticate (if not already)
gh auth login

# Invite to organization
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /orgs/DESIGN-DVW/memberships/guillaume@aigenconsulting.com \
  -f role='member'

# Expected output: {"state": "pending", "role": "member", ...}

# After they accept, grant repository access
# Grant READ access to Figma-Plug-ins
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/Figma-Plug-ins/collaborators/guillaume@aigenconsulting.com \
  -f permission='pull'

# Grant access to other repos as needed
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/GlossiaApp/collaborators/guillaume@aigenconsulting.com \
  -f permission='pull'

# Continue for other repositories...
```text

## Bulk Grant Access Script

To grant READ access to all repositories at once:

```bash
#!/bin/bash

# List of repositories
repos=(
  "Aprimo"
  "CampaignManager"
  "DocuMind"
  "Figma-Plug-ins"
  "LibraryAssetManager"
  "RootDispatcher"
  "FigmaDSController"
  "FigmailAPP"
  "GlossiaApp"
)

# Grant READ access to all
for repo in "${repos[@]}"; do
  echo "Granting access to $repo..."
  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "/repos/DESIGN-DVW/$repo/collaborators/guillaume@aigenconsulting.com" \
    -f permission='pull'
  echo "✓ Access granted to $repo"
done

echo "✅ All done!"
```text

Save as `grant-access.sh`, then run:

```bash
chmod +x grant-access.sh
./grant-access.sh
```text

## Invitation Complete! ✅

**Result:**

- Invitation sent to <guillaume@aigenconsulting.com>
- User will receive email
- After acceptance, they'll have access to specified repositories

## Verification Steps

### Verify Migration

```bash
# Check GlossiaApp remote
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp
git config --get remote.origin.url
# Should be: https://github.com/DESIGN-DVW/GlossiaApp.git
```text

**In browser:**

1. Visit: <https://github.com/DESIGN-DVW/GlossiaApp> ✓
2. Visit: <https://github.com/DVW-Design/GlossiaApp> → Should redirect ✓
3. Check organization: <https://github.com/DESIGN-DVW> → Should show 9 repos ✓

## Verify Invitation

```bash
# Check pending invitations
gh api /orgs/DESIGN-DVW/invitations | jq '.[].login'
# Should include: guillaume@aigenconsulting.com (if pending)

# Check organization members (after acceptance)
gh api /orgs/DESIGN-DVW/members | jq '.[].login'
# Should include: guillaume@aigenconsulting.com (after they accept)
```text

## Test User Access (As Guillaume)

Have <guillaume@aigenconsulting.com> try:

```bash
# Clone Figma-Plug-ins
git clone https://github.com/DESIGN-DVW/Figma-Plug-ins.git test-clone

# Expected: Success (if they have access)
# Error: Repository not found (if not yet granted access)

# View file in browser
# Visit: https://github.com/DESIGN-DVW/Figma-Plug-ins/blob/main/docs/plugin-ideas/BUSINESS-ANALYSIS.md
# Should be able to view (if they have access)
```text

## Success Criteria

### ✅ Migration Success

- [ ] GlossiaApp accessible at <https://github.com/DESIGN-DVW/GlossiaApp>
- [ ] Old URL redirects automatically
- [ ] Local git remote updated
- [ ] Can fetch/pull from new URL
- [ ] All branches present
- [ ] All history preserved
- [ ] Backup branch exists

### ✅ Invitation Success

- [ ] Invitation sent to <guillaume@aigenconsulting.com>
- [ ] User receives email
- [ ] User accepts invitation (pending their action)
- [ ] User appears in organization members
- [ ] User can access granted repositories
- [ ] User can view BUSINESS-ANALYSIS.md file

## Troubleshooting

### Issue: Transfer Button Not Visible

**Cause:** You don't have admin access to DVW-Design organization

**Solution:** Contact DVW-Design organization owner to either:

1. Grant you admin access
2. Perform the transfer on your behalf

### Issue: Cannot Push After Migration

**Cause:** Local remote still points to old URL

**Solution:**

```bash
git remote set-url origin https://github.com/DESIGN-DVW/GlossiaApp.git
git fetch origin
git branch --set-upstream-to=origin/main main
```text

### Issue: Invitation Email Not Received

**Solutions:**

1. Check spam/junk folder
2. Verify email address is correct
3. Resend invitation from GitHub
4. Try different email if available

### Issue: User Can't Access Repository After Accepting

**Cause:** User invited to organization but not granted repository access

**Solution:** Grant repository-specific access:

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/Figma-Plug-ins/collaborators/guillaume@aigenconsulting.com \
  -f permission='pull'
```text

## After Completion

### Update Documentation

All repositories now reference DESIGN-DVW correctly, no updates needed.

### Archive DVW-Design Organization (Optional)

Once GlossiaApp is migrated and verified:

1. Go to: <https://github.com/organizations/DVW-Design/settings>
2. Scroll to "Danger Zone"
3. Consider archiving or deleting the organization
4. **Warning:** Only do this if DVW-Design is completely empty

### Notify Team Members

Send message to team:

```text
Subject: GitHub Organization Consolidation Complete

Hi team,

We've consolidated all repositories to the DESIGN-DVW organization:

New URLs:
- GlossiaApp: https://github.com/DESIGN-DVW/GlossiaApp
- All other repos: https://github.com/DESIGN-DVW/*

Old URLs will redirect for 90 days, but please update your bookmarks.

To update local repos:
cd /path/to/GlossiaApp
git remote set-url origin https://github.com/DESIGN-DVW/GlossiaApp.git

New team members should be invited to DESIGN-DVW organization.

Questions? Check docs/GLOSSIAAPP-MIGRATION-GUIDE.md
```text

## Timeline

| Task | Duration | When |
|------|----------|------|
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Commit local changes** | 5 min | Now |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Create backup** | 2 min | Before transfer |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Transfer on GitHub** | 5 min | When ready |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Update local remote** | 3 min | After transfer |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Verify migration** | 5 min | After update |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Invite guillaume** | 5 min | After migration |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Grant repo access** | 5-10 min | After acceptance |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Total** | **~30-35 min active work** | Single session |

(User acceptance of invitation happens asynchronously)

## Quick Command Reference

```bash
# === PART 1: MIGRATION ===

# 1. Commit changes
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp
git add .
git commit -m "feat: Add organization fixes and docs"
git push origin main

# 2. Create backup
git checkout -b backup-before-migration
git push origin backup-before-migration
git checkout main

# 3. Transfer on GitHub (via web interface)
# https://github.com/DVW-Design/GlossiaApp/settings

# 4. Update remote
git remote set-url origin https://github.com/DESIGN-DVW/GlossiaApp.git
git fetch origin
git branch --set-upstream-to=origin/main main
git pull

# 5. Verify
git config --get remote.origin.url

# === PART 2: INVITATION ===

# Via GitHub CLI
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /orgs/DESIGN-DVW/memberships/guillaume@aigenconsulting.com \
  -f role='member'

# Grant repository access (after they accept)
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/Figma-Plug-ins/collaborators/guillaume@aigenconsulting.com \
  -f permission='pull'
```text

## Support

**Documentation:**

- Full migration guide: `docs/GLOSSIAAPP-MIGRATION-GUIDE.md`
- Invitation guide: `docs/USER-INVITATION-GUIDE.md`
- Organization audit: `docs/GITHUB-ORGANIZATION-AUDIT-REPORT.md`

**GitHub Resources:**

- Repository Transfer: <https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository>
- Organization Members: <https://docs.github.com/en/organizations/managing-membership-in-your-organization>

**Status:** Ready to Execute
**Next Step:** Start with Part 1, Step 1 (Commit local changes)

**Version:** 1.0.0
**Created:** 2025-11-13
**Last Updated:** 2025-11-13
