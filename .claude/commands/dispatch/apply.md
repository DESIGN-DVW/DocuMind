Apply a specific dispatch or batch of dispatches to target repos.

## Usage

`/dispatch-apply <DISPATCH-ID>` — Apply one dispatch
`/dispatch-apply --ready` — Apply all dispatches with no blockers
`/dispatch-apply --repo <REPO>` — Apply all pending dispatches for a specific repo

## Process

1. Read the dispatch file from `dispatches/pending/`

2. Parse frontmatter: id, targets, priority, depends-on, defer-until

3. Validate:

   - All `depends-on` dispatches are in `applied/` or `archive/`

   - `defer-until` date has passed (if set)

   - Target repos exist in `config/repository-registry.json`

4. For each target repo:

   a. Spawn a sub-agent with the dispatch instructions adapted to that repo
   b. Sub-agent reads repo memory + global rules first
   c. Sub-agent applies the change
   d. Sub-agent returns result summary

5. On success:

   - Move dispatch file to `dispatches/applied/`

   - Update `memory/repos/{REPO}.md` for each target

   - Append to `memory/changelog.jsonl`

6. On partial failure:

   - Keep dispatch in `pending/`

   - Report which repos succeeded and which failed

   - Update memory for succeeded repos only

## Sub-Agent Prompt

For each target repo, the sub-agent receives:

```json

Working directory: /Users/Shared/htdocs/github/DVWDesign/{REPO_PATH}
Dispatch: {DISPATCH-ID}
Priority: {priority}

{full dispatch body}

Read first:

- /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/repos/{REPO}.md

- /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/global-rules.md

After completing: update the repo memory file and return a summary.

```

## Parallelization

- Up to 5 repo sub-agents run in parallel

- Repos sharing filesystem paths (monorepos) run serially

- shared-packages always runs before its consumers

## Arguments

$ARGUMENTS
