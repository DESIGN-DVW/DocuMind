---
date: "2026-07-28"
classification: "discoveries/patterns"
status: "active"
---

# Discoveries

The **Discoveries** category is the durable home for cross-repo patterns, fixes, and insights worth carrying beyond the session that found them. It formalizes the "Documentation/patterns → index in DocuMind" leg of the ecosystem **Discovery Policy** (canonical in `RootDispatcher/memory/global-rules.md`, mirrored in `~/.claude/CLAUDE.md` §7).

> Knowledge must not die in one session. If it's worth knowing, it must be shared.

## What belongs here

- A **pattern** reusable beyond the repo that discovered it (an approach, an idiom, a workflow).
- A **fix** whose root-cause analysis is useful elsewhere (a class of bug, not a one-off).
- An **integration** finding — how two systems actually connect in practice.
- An **insight** — a non-obvious behavior, constraint, or gotcha future agents should know.

Not this: routine changelog entries, repo-local bug fixes with no cross-repo value, or anything the code/git history already records.

## How to file a discovery

1. Copy [TEMPLATE.md](TEMPLATE.md) to `docs/discoveries/<YYYY-MM-DD>-<slug>.md`.
2. Fill in the frontmatter — set `classification` to the matching subtype:

   | Subtype | Use for |
   | - | - |
   | `discoveries/patterns` | Reusable approaches, idioms, workflows (default) |
   | `discoveries/integrations` | How two systems connect |
   | `discoveries/insights` | Non-obvious behavior, constraints, gotchas |

3. Write the finding: what you found, why it matters, how to apply it elsewhere.
4. **Index it** so it's searchable across the ecosystem:

   ```text
   mcp__documind__index_file  → path: docs/discoveries/<file>.md
   ```

5. If it's ecosystem-wide news, also announce it (see the Discovery Policy fan-out below).

## Classification

Any markdown file under `docs/discoveries/` classifies as `discoveries/*` automatically (path rule in `config/profiles/dvwdesign.json`). A file may override the subtype via its `classification` frontmatter. The folder also renders as a distinct `discoveries` node type in DocuMind tree/graph output.

## The Discovery Policy fan-out

When a finding is useful beyond the current repo, route it:

| Kind | Destination |
| - | - |
| Reusable code | Propose to `shared-packages` |
| Documentation / patterns | File here + index via `mcp__documind__index_file` |
| Ecosystem-wide news | `mcp__agenthub__publish_discovery` |
| Repo-targeted change | Dispatch in `RootDispatcher/dispatches/pending/{REPO}/` |
