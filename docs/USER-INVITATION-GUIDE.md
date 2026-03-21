# GitHub Organization User Invitation Guide

**Organization:** DESIGN-DVW
**Purpose:** Grant <guillaume@aigenconsulting.com> access to all repositories
**Last Updated:** 2025-11-13

---

## Quick Start

### Immediate Action Required

**User:** <guillaume@aigenconsulting.com> currently has NO access to DESIGN-DVW repositories.

**Solution:** Invite them to the DESIGN-DVW organization.

---

## Why <guillaume@aigenconsulting.com> Can't Access Repositories

### Current Situation

| Organization   | Has Access? | Repositories                                     |
| -------------- | ----------- | ------------------------------------------------ |
| **DVW-Design** | ✅ YES       | GlossiaApp only                                  |
| **DESIGN-DVW** | ❌ NO        | All other repos (Figma-Plug-ins, DocuMind, etc.) |

### The Problem

When you asked why <guillaume@aigenconsulting.com> couldn't access:
`https://github.com/DESIGN-DVW/Figma-Plug-ins/blob/.../BUSINESS-ANALYSIS.md`

**Answer:** They were invited to `DVW-Design` but NOT `DESIGN-DVW` (different organizations).

---

## Invitation Methods

### Method 1: GitHub Web Interface (Easiest)

#### Step-by-Step Instructions

1. **Go to Organization People page:**
   - Visit: <https://github.com/orgs/DESIGN-DVW/people>
   - Must be logged in as organization owner/admin

2. **Click "Invite member"**
   - Button is at top-right of page

3. **Enter user information:**

   ```text
   Username or email: guillaume@aigenconsulting.com
   ```

4. **Select role:**
   - **Member** (Recommended) - Can access repositories based on team permissions
   - **Owner** - Full admin access to organization

   **Recommended:** Start with "Member" role

5. **Click "Send invitation"**

6. **User receives email:**
   - Subject: "You've been invited to join the DESIGN-DVW organization"
   - Contains link to accept invitation

7. **User accepts invitation:**
   - Clicks link in email
   - Logs into GitHub
   - Clicks "Join DESIGN-DVW"

#### After Invitation Accepted

Grant repository access:

1. Go to: <https://github.com/DESIGN-DVW/Figma-Plug-ins/settings/access>
2. Click "Add people or teams"
3. Search for: <guillaume@aigenconsulting.com>
4. Select permission level:
   - **Read** - Can view and clone
   - **Triage** - Can manage issues and PRs
   - **Write** - Can push to repository
   - **Maintain** - Can manage repository settings
   - **Admin** - Full access

5. Click "Add <guillaume@aigenconsulting.com> to this repository"

**Repeat for each repository they need access to.**

### Method 2: GitHub CLI (Fastest for Multiple Repos)

#### Prerequisites

```bash
# Install GitHub CLI (if not already installed)
brew install gh

# Authenticate
gh auth login
```

## Invite User to Organization

```bash
# Invite to organization as member
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /orgs/DESIGN-DVW/memberships/guillaume@aigenconsulting.com \
  -f role='member'

# Expected output:
# {
#   "state": "pending",
#   "role": "member",
#   ...
# }
```

## Grant Access to Specific Repositories

```bash
# Grant READ access to Figma-Plug-ins
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/Figma-Plug-ins/collaborators/guillaume@aigenconsulting.com \
  -f permission='pull'

# Grant READ access to DocuMind
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/DocuMind/collaborators/guillaume@aigenconsulting.com \
  -f permission='pull'

# Grant WRITE access to FigmailAPP
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/FigmailAPP/collaborators/guillaume@aigenconsulting.com \
  -f permission='push'
```

**Permission levels:**

- `pull` = Read access
- `push` = Write access
- `admin` = Admin access
- `maintain` = Maintain access
- `triage` = Triage access

## Grant Access to ALL Repositories (Bulk)

```bash
#!/bin/bash

# Array of repositories
repos=(
  "Aprimo"
  "CampaignManager"
  "DocuMind"
  "Figma-Plug-ins"
  "LibraryAssetManager"
  "RootDispatcher"
  "FigmaDSController"
  "FigmailAPP"
)

# Grant READ access to all repositories
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
```

Save as `grant-access.sh` and run:

```bash
chmod +x grant-access.sh
./grant-access.sh
```

## Method 3: GitHub Teams (Best for Multiple Users)

If you plan to invite multiple users with similar permissions:

### 1. Create a Team

1. Go to: <https://github.com/orgs/DESIGN-DVW/teams>
2. Click "New team"
3. Enter:
   - Team name: `External Collaborators` (or appropriate name)
   - Description: "External team members and consultants"
   - Visibility: Visible or Secret

4. Click "Create team"

#### 2. Add Members to Team

1. Go to team page: `https://github.com/orgs/DESIGN-DVW/teams/external-collaborators`
2. Click "Add a member"
3. Search for: <guillaume@aigenconsulting.com>
4. Select role:
   - **Member** - Normal team member
   - **Maintainer** - Can manage team

5. Click "Add <guillaume@aigenconsulting.com> to External Collaborators"

#### 3. Grant Team Access to Repositories

1. Go to repository: `https://github.com/DESIGN-DVW/Figma-Plug-ins/settings/access`
2. Click "Add teams"
3. Search for: External Collaborators
4. Select permission level (Read, Write, Admin)
5. Click "Add External Collaborators to this repository"

**Benefit:** Future users can be added to the team instead of each repository individually.

## Recommended Permission Levels

### For External Consultants (like <guillaume@aigenconsulting.com>)

| Repository        | Recommended Permission       | Reason                                       |
| ----------------- | ---------------------------- | -------------------------------------------- |
| Figma-Plug-ins    | **Read**                     | Can view BUSINESS-ANALYSIS.md and other docs |
| DocuMind          | **Read**                     | Can view documentation                       |
| FigmailAPP        | **Write** (if working on it) | Can contribute code                          |
| FigmaDSController | **Write** (if working on it) | Can contribute code                          |
| All Others        | **Read** or None             | Access based on need                         |

### For Full-Time Team Members

| Repository       | Recommended Permission | Reason                         |
| ---------------- | ---------------------- | ------------------------------ |
| All Repositories | **Write**              | Can contribute to all projects |
| Critical Repos   | **Maintain**           | Can manage issues and PRs      |

### For Organization Admins

| Repository       | Recommended Permission | Reason       |
| ---------------- | ---------------------- | ------------ |
| All Repositories | **Admin**              | Full control |

## Verification

### Check If Invitation Was Sent

```bash
# List pending invitations
gh api /orgs/DESIGN-DVW/invitations

# Expected output: Array of pending invitations
```

## Check If User Accepted Invitation

```bash
# List organization members
gh api /orgs/DESIGN-DVW/members | jq '.[].login'

# Should include: guillaume@aigenconsulting.com (if accepted)
```

## Check Repository Access

```bash
# List collaborators for Figma-Plug-ins
gh api /repos/DESIGN-DVW/Figma-Plug-ins/collaborators | jq '.[].login'

# Should include: guillaume@aigenconsulting.com (if granted access)
```

## Test Access (As User)

Have <guillaume@aigenconsulting.com> try:

```bash
# Clone repository
git clone https://github.com/DESIGN-DVW/Figma-Plug-ins.git

# Expected: Success (if they have access)
# Error: Repository not found (if they don't have access yet)
```

Or visit in browser:

- <https://github.com/DESIGN-DVW/Figma-Plug-ins>
- Should be able to see and browse files

## Troubleshooting

### Issue: Invitation Not Received

**Solutions:**

1. Check spam/junk folder
2. Verify email address is correct
3. Resend invitation from GitHub
4. Use different email address if needed

### Issue: "Repository not found" After Accepting Invitation

**Cause:** Invited to organization but not granted repository access

**Solution:** Grant repository access (see Method 1 or 2 above)

### Issue: Can View But Can't Clone

**Cause:** Repository is private and user doesn't have access

**Solution:**

1. Verify user accepted organization invitation
2. Grant repository access explicitly
3. Check if repository is public or private

### Issue: Can Clone But Can't Push

**Cause:** User has READ access but needs WRITE access

**Solution:** Upgrade permission level to "Write" or "Push"

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/DESIGN-DVW/Figma-Plug-ins/collaborators/guillaume@aigenconsulting.com \
  -f permission='push'
```

## After Migration of GlossiaApp

Once GlossiaApp is migrated from DVW-Design to DESIGN-DVW:

1. <guillaume@aigenconsulting.com> will automatically have access (already in DESIGN-DVW)
2. No need for separate access to DVW-Design organization
3. Single invitation grants access to all repos

**Current:** Need access to 2 organizations
**After Migration:** Need access to 1 organization only

## Checklist

### Immediate Actions

- [ ] Invite <guillaume@aigenconsulting.com> to DESIGN-DVW organization
- [ ] Wait for them to accept invitation
- [ ] Grant access to Figma-Plug-ins repository (minimum)
- [ ] Grant access to other repositories as needed
- [ ] Verify they can access BUSINESS-ANALYSIS.md file

### After GlossiaApp Migration

- [ ] Migrate GlossiaApp from DVW-Design to DESIGN-DVW
- [ ] Verify <guillaume@aigenconsulting.com> still has access to GlossiaApp
- [ ] Remove their access from DVW-Design organization (if unused)
- [ ] Confirm all repositories are in one organization

## Quick Reference

### Organization URLs

- **Organization page:** <https://github.com/DESIGN-DVW>
- **People management:** <https://github.com/orgs/DESIGN-DVW/people>
- **Team management:** <https://github.com/orgs/DESIGN-DVW/teams>
- **Settings:** <https://github.com/organizations/DESIGN-DVW/settings>

### Key Repositories

- **Figma-Plug-ins:** <https://github.com/DESIGN-DVW/Figma-Plug-ins>
- **DocuMind:** <https://github.com/DESIGN-DVW/DocuMind>
- **FigmailAPP:** <https://github.com/DESIGN-DVW/FigmailAPP>
- **GlossiaApp (after migration):** <https://github.com/DESIGN-DVW/GlossiaApp>

### User Email

- **Email:** <guillaume@aigenconsulting.com>
- **Current Access:** DVW-Design organization only
- **Needed Access:** DESIGN-DVW organization

## Summary

**Problem:** <guillaume@aigenconsulting.com> can't access DESIGN-DVW repositories

**Root Cause:** Only invited to DVW-Design organization, not DESIGN-DVW

**Solution:** Invite them to DESIGN-DVW organization

**Time Required:** 5 minutes to invite, 2 minutes for them to accept

**Next Steps:**

1. Use Method 1 (web interface) to invite
2. Wait for acceptance email
3. Grant repository-specific access
4. Verify they can access files

**Version:** 1.0.0
**Last Updated:** 2025-11-13
**Status:** Ready to Execute
