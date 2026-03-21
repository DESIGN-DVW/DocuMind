# GlossiaApp Migration Guide

**From:** DVW-Design organization
**To:** DESIGN-DVW organization
**Status:** Pending
**Priority:** High

---

## Overview

GlossiaApp is currently in the legacy `DVW-Design` GitHub organization and needs to be migrated to the primary `DESIGN-DVW` organization for consistency and unified access management.

**Current URL:** `https://github.com/DVW-Design/GlossiaApp`
**Target URL:** `https://github.com/DESIGN-DVW/GlossiaApp`

---

## Why This Migration Is Necessary

### Current Problems

1. **Split Organization Access**
   - Users need separate invitations to DVW-Design and DESIGN-DVW
   - <guillaume@aigenconsulting.com> has access to GlossiaApp but not other repos
   - Confusing for team members and collaborators

2. **Inconsistent Organization Structure**
   - 8 repositories in DESIGN-DVW (primary)
   - 1 repository in DVW-Design (GlossiaApp only)
   - Different access controls and settings

3. **Documentation References**
   - All docs now reference DESIGN-DVW
   - GlossiaApp is the only exception
   - Creates confusion and broken cross-references

### Benefits of Migration

1. **Single Organization**
   - All 9 repositories in one place
   - One invitation grants access to everything
   - Easier team management

2. **Consistent Naming**
   - All repos under DESIGN-DVW
   - Matches documentation
   - Clearer organization structure

3. **Simplified Access Control**
   - One organization to manage
   - One place to set permissions
   - Easier onboarding for new team members

---

## Pre-Migration Checklist

### Step 1: Verify Permissions

You need **admin access** to both organizations:

- [ ] Admin access to DVW-Design organization
- [ ] Admin access to DESIGN-DVW organization
- [ ] Owner/admin rights to GlossiaApp repository

### Step 2: Backup Current State

```bash
# Navigate to GlossiaApp
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Verify current remote
git remote -v
# Should show: https://github.com/DVW-Design/GlossiaApp.git

# Create backup branch
git checkout -b backup-before-migration
git push origin backup-before-migration

# Return to main branch
git checkout main
```

## Step 3: Document Current Collaborators

```bash
# Use GitHub CLI to list current collaborators
gh api repos/DVW-Design/GlossiaApp/collaborators | jq '.[].login'

# Or visit: https://github.com/DVW-Design/GlossiaApp/settings/access
```

**Current known collaborators:**

- <guillaume@aigenconsulting.com>
- (Add others here)

## Step 4: Check for Dependencies

- [ ] No CI/CD pipelines that hardcode the organization name
- [ ] No external webhooks pointing to DVW-Design/GlossiaApp
- [ ] No package dependencies referencing the old URL
- [ ] No submodules in other repositories pointing to DVW-Design/GlossiaApp

## Migration Steps

### Option A: GitHub Repository Transfer (Recommended)

This is the cleanest method and preserves all history, issues, and PRs.

#### 1. Transfer Repository on GitHub

1. Go to: `https://github.com/DVW-Design/GlossiaApp/settings`
2. Scroll to "Danger Zone"
3. Click "Transfer ownership"
4. Enter:
   - New owner: `DESIGN-DVW`
   - Repository name: `GlossiaApp` (same name)
   - Type "DVW-Design/GlossiaApp" to confirm
5. Click "I understand, transfer this repository"

**What This Does:**

- Moves repository to DESIGN-DVW organization
- Preserves all git history
- Preserves all issues, PRs, wikis
- **GitHub automatically redirects old URLs to new location**
- Old URL (`DVW-Design/GlossiaApp`) → New URL (`DESIGN-DVW/GlossiaApp`)

#### 2. Update Local Git Remote

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Update remote URL
git remote set-url origin https://github.com/DESIGN-DVW/GlossiaApp.git

# Verify change
git remote -v

# Test connection
git fetch origin

# Expected output: Successfully fetched from new URL
```

## 3. Update Local Repository Tracking

```bash
# Ensure main branch tracks new remote
git branch --set-upstream-to=origin/main main

# Pull to verify everything works
git pull

# Expected output: Already up to date (or pulls latest changes)
```

## Option B: Manual Migration (If Transfer Not Available)

If you don't have transfer permissions, use this method:

### 1. Create New Repository in DESIGN-DVW

```bash
# Using GitHub CLI
gh repo create DESIGN-DVW/GlossiaApp --public --description "Glossia application"

# Or create manually at: https://github.com/organizations/DESIGN-DVW/repositories/new
```

## 2. Mirror Repository

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Add new remote
git remote add new-origin https://github.com/DESIGN-DVW/GlossiaApp.git

# Push all branches
git push new-origin --all

# Push all tags
git push new-origin --tags

# Remove old remote and rename new one
git remote remove origin
git remote rename new-origin origin

# Verify
git remote -v
```

## 3. Archive Old Repository

1. Go to: `https://github.com/DVW-Design/GlossiaApp/settings`
2. Scroll to "Danger Zone"
3. Click "Archive this repository"
4. Add notice in README: "This repository has moved to <https://github.com/DESIGN-DVW/GlossiaApp>"

## Post-Migration Steps

### Step 1: Verify Migration

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp

# Check remote URL
git remote -v
# Should show: https://github.com/DESIGN-DVW/GlossiaApp.git

# Test fetch
git fetch origin

# Test push (if you have changes)
# git push origin main
```

## Step 2: Invite Collaborators to DESIGN-DVW

Now that GlossiaApp is in DESIGN-DVW, invite all collaborators:

```bash
# Using GitHub CLI
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /orgs/DESIGN-DVW/memberships/guillaume@aigenconsulting.com \
  -f role='member'

# Or visit: https://github.com/orgs/DESIGN-DVW/people
# Click "Invite member"
# Enter email addresses
```

## Step 3: Update Documentation

All documentation has already been updated by the fix-github-org-references script.

Verify updates in:

- [x] GlossiaApp/package.json
- [x] GlossiaApp/SECURITY.md
- [x] Cross-repository references

### Step 4: Update Package.json

The script already updated package.json, but verify:

```bash
cd /Users/Shared/htdocs/github/DVWDesign/GlossiaApp
cat package.json | grep "repository"
```

Should show:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/DESIGN-DVW/GlossiaApp.git"
}
```

### Step 5: Test Access

Have <guillaume@aigenconsulting.com> test access:

```bash
# Try cloning from new URL
git clone https://github.com/DESIGN-DVW/GlossiaApp.git test-clone
cd test-clone

# Verify contents
ls -la

# Clean up
cd ..
rm -rf test-clone
```

## Step 6: Archive DVW-Design Organization (Optional)

Once GlossiaApp is migrated and verified:

1. Check if DVW-Design has any other repositories
2. If empty, consider archiving or deleting the organization
3. This eliminates confusion and maintenance overhead

## Rollback Plan

If something goes wrong during migration:

### If Using Transfer Method

1. GitHub keeps automatic redirects for 90 days
2. Contact GitHub support to reverse transfer if needed within 24 hours
3. Local git remotes can be reverted:

```bash
git remote set-url origin https://github.com/DVW-Design/GlossiaApp.git
```

### If Using Manual Method

1. Old repository still exists (archived)
2. Unarchive old repository
3. Delete new repository if needed
4. Update local remote back to old URL

## Common Issues and Solutions

### Issue: "Repository not found" Error

**Cause:** Git remote still points to old URL

**Solution:**

```bash
git remote set-url origin https://github.com/DESIGN-DVW/GlossiaApp.git
git fetch origin
```

### Issue: Permission Denied

**Cause:** User not invited to DESIGN-DVW organization

**Solution:**

1. Go to: <https://github.com/orgs/DESIGN-DVW/people>
2. Invite user to organization
3. User accepts invitation
4. Try again

### Issue: Old URL Still Works

**Explanation:** This is normal! GitHub redirects for 90 days.

**Action:** No action needed, but update all local remotes to new URL.

## Verification Checklist

After migration, verify:

- [ ] Can clone from new URL: `git clone https://github.com/DESIGN-DVW/GlossiaApp.git`
- [ ] Can push changes to new URL
- [ ] All branches transferred
- [ ] All tags transferred
- [ ] All collaborators have access
- [ ] CI/CD pipelines work (if applicable)
- [ ] Package.json has correct repository URL
- [ ] Documentation references updated
- [ ] Old URL redirects to new URL (if using transfer method)

## Migration Timeline

| Step | Estimated Time | When to Do |
| ------ | --------------- | ------------ |
| Pre-migration checklist | 15 minutes | Before migration |
| GitHub transfer | 2 minutes | During migration |
| Update local remotes | 5 minutes | Immediately after |
| Invite collaborators | 10 minutes | Immediately after |
| Verification | 15 minutes | Immediately after |
| **Total** | **~45 minutes** | **Single session** |

## Contact Information

**For GitHub Transfer Issues:**

- GitHub Support: <https://support.github.com>
- GitHub Docs: <https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository>

**For Access Issues:**

- Organization owners of DESIGN-DVW
- Repository administrators

## Next Steps

1. [ ] Review this guide
2. [ ] Complete pre-migration checklist
3. [ ] Choose migration method (Option A recommended)
4. [ ] Execute migration during low-activity time
5. [ ] Complete post-migration steps
6. [ ] Verify everything works
7. [ ] Inform all collaborators of new URL

**Status:** Ready to Execute
**Last Updated:** 2025-11-13
**Version:** 1.0.0
