# Onboarding — DocuMind

**Version:** 1.0.0 | **Generated:** 2026-03-29

Welcome, Claude. You are the AI agent for **DocuMind** — documentation intelligence MCP server with search, linting, and diagram registry.

## Quick Start

1. Read your `CLAUDE.md` file for repo-specific context

2. Read your memory file: `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/repos/DocuMind.md`

3. Check for pending dispatches in `dispatches/pending/ALL/` and `dispatches/pending/DocuMind/`

4. Read shared conventions: `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/memory/global-rules.md`

## Ecosystem Tools

### DocuMind MCP

DocuMind is the documentation intelligence layer across all DVWDesign repos.

| Tool | Purpose |

| ---- | ------- |

| `mcp__documind__search_docs` | Search documentation across all indexed repos |

| `mcp__documind__lint_file` | Lint a markdown file for standards compliance |

| `mcp__documind__fix_file` | Auto-fix linting issues in a markdown file |

| `mcp__documind__get_related` | Find related documents to a given file |

| `mcp__documind__get_similarities` | Find similar content across repos |

| `mcp__documind__get_deviations` | Detect deviations from ecosystem conventions |

| `mcp__documind__register_diagram` | Register a diagram in the central registry |

| `mcp__documind__curate_diagram` | Relink a diagram after FigJam curation |

| `mcp__documind__get_diagrams` | List all registered diagrams |

| `mcp__documind__get_keywords` | Extract keywords from documentation |

| `mcp__documind__trigger_scan` | Trigger a documentation scan |

| `mcp__documind__index_file` | Index a file for search |

**When to use:** Prefer DocuMind over manual grep/read for documentation queries. It understands context and relationships between docs.

### Figma MCP

Two Figma MCP servers are available:

| Server | Use Case |

| ------ | -------- |

| `figma-desktop` (port 3845) | Read DVW Design files (must be open in Figma Beta) |

| `claude.ai Figma` (remote) | Generate diagrams, write designs, Code Connect |

#### Key tools:

- `get_design_context` — Read design from Figma (primary tool for design-to-code)

- `generate_diagram` — Create FigJam diagrams from Mermaid syntax

- `get_variable_defs` — Extract design tokens/variables

- `add_code_connect_map` — Link Figma nodes to code components

- `create_design_system_rules` — Create rules for design-to-code translation

**Triple output rule:** Every diagram must produce:

1. `.mmd` source in `docs/diagrams/`

2. `.png` preview: `npx -y @mermaid-js/mermaid-cli mmdc -i <input>.mmd -o <output>.png`

3. FigJam view via `generate_diagram` MCP tool + `register_diagram`

**Central FigJam board:** `https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/DVW-Design-Dev-Strategy`

### Aikido Security MCP

Security scanning via `@aikidosec/mcp`. Run `/security-scan` before any commit that touches dependencies, auth, or data handling.

### Supabase MCP

Available for database operations, migrations, edge functions, and type generation. Use `mcp__claude_ai_Supabase__*` tools for all Supabase interactions.

## Shared Packages

The `@design-dvw/*` namespace on GitHub Packages (npm) provides shared utilities:

| Package | Purpose |

| ------- | ------- |

| `@design-dvw/utils` | Common utilities (string, date, validation helpers) |

| `@design-dvw/brand` | DVW Design System tokens (colors, typography, spacing) |

| `@design-dvw/ui` | Shared UI components (React + Tailwind) |

| `@design-dvw/supabase` | Supabase client config + shared types |

| `@design-dvw/mongodb` | MongoDB connection helpers + shared schemas |

| `@design-dvw/upload-core` | File upload utilities (chunked, resumable) |

**Migration guide:** `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/docs/shared-packages/MIGRATION-GUIDE.md`

## Slash Commands

| Command | Purpose |

| ------- | ------- |

| `/figma-analyze` | Analyze Figma components via MCP |

| `/figma-extract-tokens` | Extract design tokens (CSS, TypeScript, Tailwind, MUI) |

| `/figma-generate-code` | Generate component code from Figma designs |

| `/figma-diagram` | Create FigJam diagram (triple output + registry) |

| `/figma-curate` | Relink diagram after FigJam curation |

| `/diagram-registry` | View/manage diagram registry |

| `/security-scan` | Dependency audit + secret detection + code patterns |

| `/deploy-check` | Pre-deployment validation (types, lint, tests, build) |

| `/handover` | Generate handover doc + update memory file |

| `/push` | Push changes to GitHub with proper checks |

| `/repo-create` | Create a new ecosystem repository |

| `/storybook-upgrade` | Upgrade Storybook across repos |

| `/automation-status` | Check automation status across all repos |

## Dispatch & Proposal System

**Dispatches** are instructions from RootDispatcher to repos:

- Pending: `dispatches/pending/ALL/` or `dispatches/pending/{REPO}/`

- Applied: `dispatches/applied/`

- Format: `DISPATCH-{NNN}-{brief-description}.md`

**Proposals** are feature/fix/enhancement requests from repos to shared-packages:

- Submit to: `proposals/features/pending/`, `proposals/fixes/pending/`, or `proposals/enhancements/pending/`

- Format defined in: `proposals/PROPOSAL-LIFECYCLE.md`

## Conventions

- **Git:** Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)

- **Security:** Private repos by default. Run `/security-scan` before pushing dependency or auth changes

- **Diagrams:** Triple output rule (.mmd + .png + FigJam). Register via DocuMind MCP

- **TypeScript:** TypeScript-first ecosystem. Run ESLint before committing

- **Storybook:** UI components must have stories. Port range 6000-6099

## Port Registry

All dev server ports are centrally managed in `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/config/port-registry.json`. Never hardcode ports — check the registry.

---

### Onboarding v1.0.0 | Generated 2026-03-29 | DocuMind
