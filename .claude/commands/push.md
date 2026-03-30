# Push Changes to GitHub

Push committed changes to the remote GitHub repository with safety checks.

## Pre-Push Checklist

Before pushing, verify:

1. **Changes are committed:**

   ```bash

   git status

   ```

   - Ensure working tree is clean

   - No uncommitted changes

2. **Remote is configured:**

   ```bash

   git remote -v

   ```

   - Verify origin points to correct GitHub repo

3. **Branch is up to date:**

   ```bash

   git fetch origin
   git status

   ```

   - Check for diverged branches

   - Pull if needed: `git pull origin <branch>`

## Push Commands

### Standard Push (Current Branch)

```bash

git push origin HEAD

```

### Push with Upstream Tracking

```bash

git push -u origin <branch-name>

```

### Push All Branches

```bash

git push origin --all

```

## Safety Protocols

### NEVER:

- ❌ Force push to main/master branches

- ❌ Push without running tests first

- ❌ Push .env files or secrets

- ❌ Push with failing builds

### ALWAYS:

- ✅ Run `git status` before pushing

- ✅ Verify branch name before pushing

- ✅ Check for pre-push hooks output

- ✅ Ensure tests pass

## Common Scenarios

### Scenario 1: First Push on New Branch

```bash

git push -u origin feature/new-feature

```

### Scenario 2: Push After Commits

```bash

git status                    # Verify clean
git log --oneline -3          # Review recent commits
git push origin HEAD          # Push current branch

```

### Scenario 3: Push After Rebase

```bash

# Only if you're SURE no one else is using this branch

git push --force-with-lease origin <branch-name>

```

## Error Handling

### Error: "Updates were rejected"

**Cause:** Remote has commits you don't have locally

#### Fix:

```bash

git fetch origin
git pull origin <branch-name> --rebase
git push origin HEAD

```

### Error: "Repository not found"

**Cause:** Remote URL incorrect

#### Fix:

```bash

gh repo view --web  # Verify repo exists
git remote -v       # Check remote URL

```

### Error: "Pre-push hook failed"

**Cause:** Quality gate failure (tests, linting, security scan)

#### Fix:

- Review hook output

- Fix the issues

- Re-commit if needed

- Try push again

## Post-Push Verification

After successful push:

1. **Verify on GitHub:**

   ```bash

   gh repo view --web

   ```

2. **Check CI/CD Status:**

   ```bash

   gh run list --limit 3

   ```

3. **Confirm Branch Protection:**

   - If pushing to protected branch, verify PR created

---

**Note:** This command should be used after you've committed your changes. If you need to commit first, use the standard git workflow or request commit assistance.
