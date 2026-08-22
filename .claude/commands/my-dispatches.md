---
name: my-dispatches
description: Show only the dispatches this repo (DocuMind) must act on, and record completion without clobbering other repos.
allowed-tools: Bash, Read
---

# /my-dispatches — What DocuMind actually has to do

Thin wrapper around the canonical command in
`RootDispatcher/commands/my-dispatches.md`. Lists only dispatches that name
DocuMind in `targets` (or sit in `pending/DocuMind/`), hides anything already
acknowledged, and flags legacy shared dispatches that carry no `targets` list.

## List my dispatches

```bash
node /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/scripts/my-dispatches.mjs --repo DocuMind
```

Add `--json` for machine output. **Read only the files it lists.** If it prints
nothing, there is nothing to do — do not open the other dispatches to check.

## Record completion

Never move a shared (`pending/ALL/`) dispatch file by hand — that removes it from
every other target's pending list. Use the ack script for every completion, both
scopes; it decides whether moving is correct.

```bash
node /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/scripts/dispatch-ack.mjs \
  --repo DocuMind --dispatch DISPATCH-NNN --note "one-line result"
```

- **Repo-scoped** (`pending/DocuMind/`) -> moves to `applied/` immediately.
- **Shared** (`pending/ALL/`) -> appends DocuMind to `applied-by` and leaves the
  file in place; it moves to `applied/` once the last target acks.

Canonical definition and full rationale: `RootDispatcher/commands/my-dispatches.md`.
