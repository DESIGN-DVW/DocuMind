Run the code-reviewer agent against the current repository.

## Usage

`/review` — Quick review (Layer 1 + 5: local quality + JSON validity)
`/review full` — Full 5-layer review including ecosystem consistency
`/review pre-commit` — Review staged files only
`/review ecosystem` — Controller-level review across all repos

## Mode: $ARGUMENTS

Default mode is `quick` if no arguments provided.

## Process

1. Detect current repository name from git or working directory

2. Load the code-reviewer agent from `@figma-core/.claude/agents/code-reviewer.md`

3. Execute the appropriate review layers based on mode

4. For `full` and `ecosystem` modes, read RootDispatcher memory, dispatches, and global rules

5. Present findings as structured review with BLOCKER / WARNING / INFO categories

6. Calculate ecosystem score (0-100)

## Review Layers

| Layer | Quick | Full | Pre-commit | Ecosystem |

|-------|-------|------|------------|-----------|

| 1. Local Code Quality | X | X | X (staged only) | |

| 2. Ecosystem Consistency | | X | | X (all repos) |

| 3. Dispatch Compliance | | X | | X (all repos) |

| 4. Dependency Health | | X | | |

| 5. JSON/Config Validity | X | X | X | X |

## After Review

- BLOCKERS must be resolved before commit/merge

- Publish any new patterns discovered to AgentHub via `publish_discovery`

- If ecosystem issues found, suggest dispatch creation via `/dispatch:create`

## Arguments

$ARGUMENTS
