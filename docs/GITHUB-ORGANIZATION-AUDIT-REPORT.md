# GitHub Organization Audit Report

**Generated:** 2025-11-13
**Purpose:** Identify and resolve GitHub organization naming discrepancies

---

## Executive Summary

Your repositories are currently spread across **3 different locations**:

1. **DESIGN-DVW** (Primary GitHub Organization) - 8 repositories
2. **DVW-Design** (Legacy GitHub Organization) - 1 repository
3. **Local Only** (No GitHub remote) - 5 repositories

This causes:

- User access confusion (users need invites to multiple orgs)
- Broken documentation links (134+ incorrect URLs)
- Inconsistent naming across all docs
- Collaboration difficulties

---

## Current Repository Mapping

### Organization: DESIGN-DVW (Primary)

| Repository | Location | Status |
|-----------|----------|--------|
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| Aprimo | `https://github.com/DESIGN-DVW/Aprimo.git` | ✅ Active |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| CampaignManager | `https://github.com/DESIGN-DVW/CampaignManager.git` | ✅ Active |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| DocuMind | `https://github.com/DESIGN-DVW/DocuMind.git` | ✅ Active |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| Figma-Plug-ins | `https://github.com/DESIGN-DVW/Figma-Plug-ins.git` | ✅ Active |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| LibraryAssetManager | `https://github.com/DESIGN-DVW/LibraryAssetManager.git` | ✅ Active |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| RootDispatcher | `https://github.com/DESIGN-DVW/RootDispatcher.git` | ✅ Active |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| FigmaDSController | `https://github.com/DESIGN-DVW/FigmaDSController.git` | ✅ Active |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| FigmailAPP | `https://github.com/DESIGN-DVW/FigmailAPP` | ✅ Active |

**Total:** 8 repositories

### Organization: DVW-Design (Legacy)

| Repository | Location | Status |
|-----------|----------|--------|
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| GlossiaApp | `https://github.com/DVW-Design/GlossiaApp.git` | ⚠️ Different Org |

**Total:** 1 repository

### Local Only (No GitHub Remote)

| Repository | Local Path | Status |
|-----------|-----------|--------|
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| @figma-agents | `/Users/Shared/htdocs/github/DVWDesign/@figma-agents` | 📍 Local |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| @figma-core | `/Users/Shared/htdocs/github/DVWDesign/@figma-core` | 📍 Local |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| FigmaAPI/@figma-core | `/Users/Shared/htdocs/github/DVWDesign/FigmaAPI/@figma-core` | 📍 Local |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| FigmaAPI/@figma-docs | `/Users/Shared/htdocs/github/DVWDesign/FigmaAPI/@figma-docs` | 📍 Local |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| RandD | `/Users/Shared/htdocs/github/DVWDesign/RandD` | 📍 Local |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| mjml-dev-mode | `/Users/Shared/htdocs/github/DVWDesign/mjml-dev-mode` | 📍 Local |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| mjml-dev-mode-proposal | `/Users/Shared/htdocs/github/DVWDesign/mjml-dev-mode-proposal` | 📍 Local |

**Total:** 7 local-only repositories

---

## The Naming Problem

### GitHub Organizations (3 different names!)

1. **DESIGN-DVW** - Primary organization (8 repos)
2. **DVW-Design** - Legacy organization (1 repo)
3. **DVWDesign** - Does NOT exist on GitHub (used in docs)

### Local File System

- All repositories stored in: `/Users/Shared/htdocs/github/DVWDesign/`
- This is just a local folder name (NOT a GitHub organization)

### Documentation References

- 134+ incorrect references to `github.com/DVWDesign`
- Should be `github.com/DESIGN-DVW` or `github.com/DVW-Design`

## User Access Issues

### Current Problem

**User:** <guillaume@aigenconsulting.com>

- ✅ **HAS access to:** `DVW-Design` organization (GlossiaApp)
- ❌ **NO access to:** `DESIGN-DVW` organization (Figma-Plug-ins, DocuMind, etc.)

### Why This Happens

When you invite users to GitHub, they need separate invitations for each organization:

- Invitation to `DVW-Design` ≠ Invitation to `DESIGN-DVW`
- Each organization has separate access controls
- Users must be invited to EACH organization separately

## Recommended Solutions

### Option 1: Consolidate Everything to DESIGN-DVW (RECOMMENDED)

**Steps:**

1. **Migrate GlossiaApp from DVW-Design to DESIGN-DVW**
   - Transfer repository on GitHub: Settings → Transfer ownership
   - Update local git remote: `git remote set-url origin https://github.com/DESIGN-DVW/GlossiaApp.git`

2. **Update all 134+ documentation references**
   - Change `github.com/DVWDesign` → `github.com/DESIGN-DVW`
   - Update CLAUDE.md, README.md, all docs

3. **Invite all users to DESIGN-DVW**
   - Including <guillaume@aigenconsulting.com>
   - Grant appropriate permissions

4. **Create central configuration**
   - `config/constants.mjs` with canonical org name
   - Update all scripts to use central config

5. **Keep local folder as DVWDesign**
   - No need to rename local folders
   - Just update documentation

**Pros:**

- Single organization to manage
- Single place to invite users
- Consistent naming going forward
- GitHub auto-redirects from old URLs

**Cons:**

- Requires admin access to both organizations
- One-time migration effort

### Option 2: Keep Both Organizations

**Steps:**

1. **Document which repos belong to which org**
   - Update all docs with correct org names
   - Create mapping table

2. **Invite users to BOTH organizations**
   - Invite <guillaume@aigenconsulting.com> to DESIGN-DVW
   - Manage access in two places

3. **Update all documentation**
   - Fix 134+ incorrect references
   - Use correct org name for each repo

**Pros:**

- No repository transfers needed
- No risk of breaking existing links

**Cons:**

- Must manage two organizations forever
- Users need invites to both orgs
- More complex documentation
- Ongoing confusion

### Option 3: Rename DESIGN-DVW to DVWDesign

**Steps:**

1. **Rename organization on GitHub**
   - Go to: `https://github.com/organizations/DESIGN-DVW/settings/profile`
   - Change name from `DESIGN-DVW` to `DVWDesign`
   - GitHub auto-redirects old URLs

2. **Migrate GlossiaApp**
   - Transfer from DVW-Design to DVWDesign

3. **Update documentation**
   - Already uses DVWDesign (less to change!)
   - Matches local folder name

**Pros:**

- Matches documentation (less to update)
- Matches local folder name
- Single organization
- GitHub auto-redirects

**Cons:**

- Requires GitHub org admin access
- Organization name changes are permanent
- Must update git remotes locally

## Recommended Action Plan (Option 1)

### Phase 1: Immediate Fixes (DocuMind Repository)

1. ✅ Create this audit report
2. Create central config file: `config/constants.mjs`
3. Update `package.json` with correct repository URLs
4. Update `CLAUDE.md` with correct org name
5. Update `README.md` with correct GitHub URLs
6. Update all docs in `docs/` directory
7. Update all scripts with GitHub references
8. Update `.claude/` agent files
9. Regenerate JSDoc documentation

### Phase 2: Cross-Repository Updates

10. Create automated script to fix all 134+ references
11. Run script across all repositories
12. Test all documentation links
13. Commit changes to each repository

### Phase 3: Organization Consolidation

14. Transfer GlossiaApp from DVW-Design to DESIGN-DVW
15. Update GlossiaApp git remote locally
16. Invite all users to DESIGN-DVW
17. Archive or delete DVW-Design organization

### Phase 4: User Access

18. Invite <guillaume@aigenconsulting.com> to DESIGN-DVW
19. Grant appropriate permissions
20. Test access to all repositories
21. Document user management process

## User Invitation Process

### To Grant Access to <guillaume@aigenconsulting.com>

#### Option A: Via GitHub Web Interface**

1. Go to: <https://github.com/orgs/DESIGN-DVW/people>
2. Click "Invite member"
3. Enter email: `guillaume@aigenconsulting.com`
4. Select role:
   - **Read** - Can view and clone repositories
   - **Write** - Can push to repositories
   - **Admin** - Full organization access
5. Click "Send invitation"
6. User receives email with invitation link

#### Option B: Via GitHub CLI**

```bash
# Install GitHub CLI if not already installed
brew install gh

# Authenticate
gh auth login

# Invite user to organization
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /orgs/DESIGN-DVW/memberships/guillaume@aigenconsulting.com \
  -f role='member'
```

#### Option C: Add to Specific Repository

If you don't want to add them to the whole organization:

```bash
# Add as collaborator to specific repository
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/Figma-Plug-ins/collaborators/guillaume@aigenconsulting.com \
  -f permission='read'
```

## Files Requiring Updates

### DocuMind Repository (2 files)

1. `README.md` - 2 references
2. `docs/07-api/jsdoc/index.html` - Generated file (will update after README fix)

### Cross-Repository (132 files)

See previous scan results for complete list.

**Most affected repositories:**

1. FigmailAPP - ~50 references
2. RootDispatcher - ~30 references
3. @figma-core - ~15 references
4. @figma-docs - ~15 references

## Next Steps

**Please confirm your preferred approach:**

1. ✅ **Option 1:** Consolidate to DESIGN-DVW (recommended)
2. ⚠️ **Option 2:** Keep both organizations
3. 🔄 **Option 3:** Rename DESIGN-DVW to DVWDesign

Once confirmed, I will:

1. Execute the chosen plan
2. Fix all documentation references
3. Create automated scripts for cross-repo updates
4. Generate user invitation links
5. Document the final organization structure

## Summary

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Primary Organization** | DESIGN-DVW | DESIGN-DVW |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Legacy Organization** | DVW-Design | Migrate to DESIGN-DVW |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Documentation References** | DVWDesign (wrong) | DESIGN-DVW (correct) |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Local Folder** | DVWDesign | DVWDesign (unchanged) |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Total Repositories** | 16 (8 GitHub, 1 legacy, 7 local) | 16 (9 GitHub, 7 local) |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Incorrect URLs** | 134+ | 0 |
| --- | --- | --- |
| --- | --- | --- |
| --- | --- | --- |
| **Organizations to Manage** | 2 | 1 |

**Status:** ⚠️ Awaiting user confirmation on preferred solution
**Priority:** High - Currently blocking user access
**Impact:** All repositories and documentation

**Version:** 1.0.0
**Last Updated:** 2025-11-13
