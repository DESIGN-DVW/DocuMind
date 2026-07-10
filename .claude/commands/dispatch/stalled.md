Surface and triage all stalled work across the DVWDesign ecosystem.

## What Gets Checked

1. **Pending dispatches** older than 7 days (respecting defer-until)

   - Source: `dispatches/pending/ALL/` and `dispatches/pending/{REPO}/`

2. **Unreviewed proposals** in any `proposals/*/pending/` directory

3. **Triaged submissions** awaiting approval in `dispatches/submissions/triaged/`

4. **Blocked dispatches** whose dependencies are themselves stalled

5. **Memory staleness** — repos with memory files not updated in 30+ days

## Output

Present a prioritized triage table:

| Item | Type | Age | Priority | Blocking Reason | Suggested Action |

|---|---|---|---|---|---|

### Suggested Actions

- **unblock**: Apply the blocking dependency first

- **split**: Break into smaller, independent dispatches

- **defer**: Set a defer-until date (legitimate delay)

- **reassign**: Move to a different target repo

- **escalate**: Requires Dave's decision

- **close**: No longer relevant, archive

## Follow-Up

After presenting the table, ask:
"Which stalled items should I act on? Options: apply blockers, defer, close, or investigate."

For items chosen for action, use `/dispatch-apply` or update the dispatch files directly.

## Arguments

$ARGUMENTS
