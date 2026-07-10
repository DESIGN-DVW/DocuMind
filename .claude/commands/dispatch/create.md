Create a new dispatch from a task description.

## Usage

`/dispatch-create <brief-description>` — Interactive dispatch creation
`/dispatch-create --from-sub <SUB-ID>` — Convert an approved submission to a dispatch

## Process

1. Determine next sequential dispatch ID:

   - Scan `dispatches/pending/`, `dispatches/applied/`, `dispatches/archive/`

   - Find highest DISPATCH-{NNN}, increment by 1

2. Gather information (ask if not provided):

   - **Title:** Brief description of the change

   - **Priority:** critical | high | normal | low

   - **Targets:** ALL or specific repo list

   - **Deadline:** Apply-by date

   - **Depends-on:** Any prerequisite dispatch IDs

   - **Context:** Why this dispatch is needed

   - **Action:** What each target repo should do

   - **Verification:** How to confirm success

   - **Adaptation notes:** Per-repo variations (if any)

3. Generate the dispatch file:

   ```json

   dispatches/pending/{scope}/DISPATCH-{NNN}-{slug}.md

   ```

   Where scope = ALL/ or {REPO}/

4. Inject "Active Instructions" into `memory/repos/{REPO}.md` for each target

5. Append to `memory/changelog.jsonl`

6. Present the created dispatch for review

## Task Splitting

If the task description implies multi-repo work, propose splitting:

- One dispatch per logical unit

- Chain via depends-on for sequential work

- Separate shared-packages changes from consumer updates

## Arguments

$ARGUMENTS
