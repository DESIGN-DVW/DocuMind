# Linear Integration - DocuMind Documentation Role

**Date**: 2025-11-14
**From**: RandD Team (Research & Testing)
**To**: DocuMind Team
**Status**: Ready for Documentation Management
**Action Required**: Prepare for documentation organization and publishing

---

## DocuMind's Primary Role

**You are the documentation manager for this organization-wide Linear adoption.**

### Your Responsibilities

```text
┌────────────────────────────────────────────────────────┐
│        DOCUMIND - DOCUMENTATION MANAGER                │
├────────────────────────────────────────────────────────┤
│                                                         │
│  ✓ Organize Linear documentation across all repos     │
│  ✓ Publish setup guides and workflow documentation    │
│  ✓ Dispatch documentation updates to all repositories │
│  ✓ Scan and auto-reorganize Linear docs globally      │
│  ✓ Maintain team-specific documentation               │
│  ✓ Create knowledge base articles                     │
│  ✓ Work in tandem with RootDispatcher on deployment   │
│                                                         │
└────────────────────────────────────────────────────────┘
```text

### What RandD Has Provided

RandD has completed the research and testing phase:

- ✅ **Created comprehensive Linear documentation** (4 major guides)
- ✅ **Tested documentation workflows** (validated for clarity)
- ✅ **Prepared cross-repository guides** (ready for dispatch)
- ✅ **Documented team structures** (team-mappings.json)
- ✅ **Created templates** (issue templates, MCP config)

### What You Will Manage

You will organize and publish Linear documentation across all repositories as RootDispatcher deploys.

---

## Summary

The organization is implementing **Linear** as a modern project management platform with AI-powered integration via MCP (Model Context Protocol).

**Deployment Model**:

- **RandD**: Research, testing, and technical guidance ✅ COMPLETE
- **RootDispatcher**: Organization-wide deployment execution 🚀 DEPLOYING
- **DocuMind**: Documentation organization and publishing 📚 YOUR ROLE

**Key Points**:

- Linear will work **alongside** existing tools (Jira optional)
- Cross-repository issue tracking via **Teams**
- Claude Code integration for AI-powered workflows
- DocuMind may have its own Linear team OR use existing team

---

## What is Linear?

Linear is a high-performance project management platform designed for software teams:

- **Speed**: Sub-50ms response times (vs slow Jira)
- **AI Integration**: Native MCP server for Claude Code
- **Developer UX**: Keyboard-first, minimal clicks
- **Modern API**: GraphQL + TypeScript SDK

## Organization Structure

### Linear Workspace: DVWDesign

Five core teams are being set up:

```text
1. RandD (RND) → DVWDesign/RandD
2. FigmailAPP (FIG) → FigmailAPP
3. FigmaDSController (FDS) → FigmaDSController
4. Aprimo (APR) → aprimo-dam-api
5. Infrastructure (INF) → All repos
```text

### DocuMind Consideration

**Option A**: Add DocuMind team

```text
6. DocuMind (DOC) → DVWDesign/DocuMind
```text

**Option B**: Use existing team based on work type

```text
- Documentation work → RandD team
- Product features → Infrastructure team
- Client work → Aprimo team (if applicable)
```text

**Recommendation**: Evaluate DocuMind's scope - if it's primarily documentation/knowledge management, it may fit in RandD or Infrastructure team initially.

## How It Works

### Cross-Repository Issue Management

From **any repository**, create issues in **any team**:

```bash
# Working in DocuMind
"Create issue in RandD team: Update documentation structure"
→ Creates RND-100

# Working in FigmailAPP
"Create DocuMind issue: Document new email template API"
→ Creates DOC-10 (if dedicated team exists)
```text

## GitHub Integration

Pull requests auto-link to Linear issues:

```markdown
## PR Description
Added API documentation for email templates

Fixes DOC-42
Relates to FIG-100
```text

→ Linear automatically links PR and updates both issues

## MCP Integration (Claude Code)

### One-Time Setup (5 minutes)

Add to `~/.config/claude/mcp.json`:

```json
{
  "mcpServers": {
    "linear": {
      "url": "https://mcp.linear.app/sse",
      "transport": "sse"
    }
  }
}
```text

### AI-Powered Issue Creation

```text
"Create a documentation task:
- Title: Document CustomTooltip component API
- Team: DocuMind (or RandD if no dedicated team)
- Priority: Medium
- Link to FDS-50"
```text

Claude Code creates the issue automatically.

## Authentication & Permissions

### User-Level Access

- **One authentication** per developer (OAuth or API key)
- **Access = all teams** you're a member of
- No per-team configuration needed

### Example

```text
Developer: sarah@company.com
Member of: RandD, DocuMind (if created), Infrastructure

MCP Access:
✅ Can create/edit issues in all 3 teams
✅ Can link documentation to code issues
✅ Can search across all teams
```text

### Security

- Recommended: OAuth (most secure)
- Alternative: Personal API key
- Permissions match Linear role (Admin/Member/Guest)

**Details**: See [LINEAR-MCP-AUTHENTICATION.md](../../RandD/docs/LINEAR-MCP-AUTHENTICATION.md) in RandD repository

## Benefits for DocuMind

### 1. Documentation-to-Code Linking

Link documentation work to implementation:

```text
Code feature (FIG-100)
  ↓ requires
Documentation (DOC-10)
  ↓ references
Component spec (FDS-50)
```text

All tracked and linked in Linear.

### 2. Faster Issue Creation

```text
Before: Manual doc task tracking, scattered
After: "Create doc task for new feature" → Done in 5 seconds
```text

### 3. Cross-Team Visibility

See when documentation is needed:

```text
FIG-100: "New email template feature"
  ↓ automatically creates
DOC-15: "Document email template API"
```text

Via automation rules.

### 4. AI-Powered Documentation Tasks

```text
# Generate doc tasks from code
"Create documentation tasks for all new FigmailAPP features this sprint"

# Link to code
"Find all undocumented components in FigmaDSController"

# Track progress
"Show documentation completion status across all teams"
```text

## DocuMind-Specific Use Cases

### Documentation Tracking

```text
# Component documentation
DOC-10: Document CustomTooltip
  Links to: FDS-50 (component implementation)

# API documentation
DOC-11: Document REST endpoints
  Links to: FIG-100 (API feature)

# User guides
DOC-12: Update user onboarding guide
  Links to: FIG-101 (new UX)
```text

## Knowledge Base Management

```text
# Articles
DOC-20: Write Linear integration guide
  Type: Article
  Status: In Progress

# Tutorials
DOC-21: Create tooltip migration tutorial
  Type: Tutorial
  Links to: Multiple components

# FAQs
DOC-22: Update deployment FAQ
  Type: FAQ
  Links to: INF-30 (deployment changes)
```text

## Documentation Sprint Planning

```text
# Sprint cycle
Cycle: Documentation Sprint 2025-W47
  ├── DOC-10 (Component docs)
  ├── DOC-11 (API docs)
  ├── DOC-12 (User guides)
  └── DOC-13 (Tutorials)
```text

## Timeline

### Phase 1: RandD Team Pilot (Week 1-2) ← Current

- RandD team tests Linear
- Workflows established
- Documentation created

### Phase 2: Core Engineering Teams (Week 3-4)

- FigmailAPP, FigmaDSController, Infrastructure added
- Cross-team workflows tested
- GitHub integration active

### Phase 3: DocuMind Evaluation (Week 5-6)

- Assess DocuMind work volume
- Decide: Dedicated team or use existing team?
- Set up chosen structure

### Phase 4: DocuMind Integration (Week 7-8)

- Add DocuMind team (if needed)
- Migrate active documentation tasks
- Link to code repositories
- Train team on workflows

## Action Items for DocuMind Team

### IMMEDIATE: Documentation Preparation (This Week)

**Your Primary Role - Documentation Manager**:

- [ ] **Review Linear documentation from RandD**
  - [ ] [LINEAR-VS-JIRA-EVALUATION.md](../../RandD/docs/LINEAR-VS-JIRA-EVALUATION.md) - Understand Linear benefits
  - [ ] [LINEAR-QUICK-START-GUIDE.md](../../RandD/docs/LINEAR-QUICK-START-GUIDE.md) - User-facing guide
  - [ ] [LINEAR-REPOSITORY-ARCHITECTURE.md](../../RandD/docs/LINEAR-REPOSITORY-ARCHITECTURE.md) - Technical architecture
  - [ ] [LINEAR-MCP-AUTHENTICATION.md](../../RandD/docs/LINEAR-MCP-AUTHENTICATION.md) - MCP setup
  - [ ] [LINEAR-WORKSPACE-SETUP.md](../../RandD/docs/LINEAR-WORKSPACE-SETUP.md) - Deployment guide

- [ ] **Plan documentation organization strategy**
  - [ ] Identify which docs need cross-repo dispatch
  - [ ] Plan documentation structure for each repository
  - [ ] Define knowledge base organization

- [ ] **Make team structure decision**
  - [ ] Assess documentation work volume (see decision matrix)
  - [ ] Decide: Dedicated DocuMind team OR use existing team?
  - [ ] Notify RandD and RootDispatcher of decision

### SHORT TERM: Documentation Publishing (Week 1-3)

**During RootDispatcher deployment** (your support role):

- [ ] **Coordinate with RootDispatcher**
  - [ ] Sync on deployment timeline
  - [ ] Prepare documentation for each deployment phase
  - [ ] Plan documentation dispatch schedule

- [ ] **Organize Linear documentation**
  - [ ] Scan existing Linear docs in RandD repository
  - [ ] Identify docs that need organization/reorganization
  - [ ] Create repository-specific documentation variants

- [ ] **Publish team-specific guides**
  - [ ] Week 1 (RandD): No action needed (docs already in RandD)
  - [ ] Week 2 (Infrastructure): Publish Infrastructure-specific Linear guide
  - [ ] Week 3 (FigmailAPP): Publish FigmailAPP-specific Linear guide
  - [ ] Week 4 (FigmaDSController): Publish design system Linear workflows
  - [ ] Week 5 (Aprimo): Publish client-facing Linear documentation

### MEDIUM TERM: Documentation Workflows (Week 3-6)

**Define and document Linear workflows** (DocuMind specialty):

- [ ] **Create workflow documentation**
  - [ ] Document documentation-to-code linking workflows
  - [ ] Create tutorials for Linear MCP usage
  - [ ] Publish FAQs for common Linear questions
  - [ ] Document team-specific best practices

- [ ] **Set up documentation templates**
  - [ ] Create Linear issue templates for documentation tasks
  - [ ] Tutorial template
  - [ ] Guide template
  - [ ] FAQ template
  - [ ] API documentation template

- [ ] **Automation for documentation**
  - [ ] Define automation rules for doc task creation
  - [ ] Link documentation to feature releases
  - [ ] Track documentation coverage across repos

### LONG TERM: Documentation Management (Month 2+)

**Ongoing documentation responsibilities** (DocuMind core):

- [ ] **Global documentation scanning**
  - [ ] Scan all repositories for Linear documentation
  - [ ] Auto-reorganize as needed
  - [ ] Maintain cross-repository consistency

- [ ] **Documentation dispatch**
  - [ ] Publish Linear updates to all repositories
  - [ ] Coordinate with RootDispatcher on deployment docs
  - [ ] Update knowledge base with new workflows

- [ ] **Track documentation tasks**
  - [ ] Monitor documentation coverage
  - [ ] Create documentation sprint planning
  - [ ] Link documentation to code implementations

**Note**: RandD provides content and RootDispatcher deploys infrastructure. DocuMind organizes and publishes.

## Team Structure Decision

### Questions to Consider

1. **Volume**: How many documentation tasks per week?
   - < 5 tasks/week → Use existing team (RandD or Infrastructure)
   - 5-15 tasks/week → Consider dedicated team
   - 15+ tasks/week → Definitely need dedicated team

2. **Type**: What kind of documentation?
   - Research/experiments → RandD team
   - Technical docs → Infrastructure team
   - Product docs → Dedicated DocuMind team

3. **Stakeholders**: Who needs visibility?
   - Internal only → RandD/Infrastructure
   - Cross-functional → Dedicated team
   - External/client → Dedicated team

### Recommended Decision Matrix

| Scenario | Recommendation |
|----------|----------------|
| --- | --- |
| --- | --- |
| --- | --- |
| Few docs, mostly research | Use RandD team |
| --- | --- |
| --- | --- |
| --- | --- |
| Infra/ops documentation | Use Infrastructure team |
| --- | --- |
| --- | --- |
| --- | --- |
| Product documentation hub | Create DocuMind team |
| --- | --- |
| --- | --- |
| --- | --- |
| Cross-functional docs | Create DocuMind team |
| --- | --- |
| --- | --- |
| --- | --- |
| High volume (15+/week) | Create DocuMind team |

## Resources

### Documentation (in RandD Repository)

1. **[LINEAR-VS-JIRA-EVALUATION.md](../../RandD/docs/LINEAR-VS-JIRA-EVALUATION.md)**
   - Complete comparison
   - Pros & cons
   - Cost analysis
   - Use cases

2. **[LINEAR-QUICK-START-GUIDE.md](../../RandD/docs/LINEAR-QUICK-START-GUIDE.md)**
   - 1-hour setup guide
   - MCP configuration
   - Common workflows
   - Keyboard shortcuts

3. **[LINEAR-REPOSITORY-ARCHITECTURE.md](../../RandD/docs/LINEAR-REPOSITORY-ARCHITECTURE.md)**
   - Cross-repo strategy
   - Team organization
   - Dispatch patterns
   - Automation

4. **[LINEAR-MCP-AUTHENTICATION.md](../../RandD/docs/LINEAR-MCP-AUTHENTICATION.md)**
   - Authentication methods
   - Permission model
   - Security best practices
   - Troubleshooting

### Centralized Configuration

Location: `RandD/.linear/`

- `README.md` - Cross-repository guide
- `team-mappings.json` - Team configuration
- `mcp-config-template.json` - Setup template

### Linear Resources

- App: <https://linear.app>
- Docs: <https://linear.app/docs>
- MCP: <https://linear.app/docs/mcp>
- API: <https://linear.app/developers>

## Documentation-Specific Workflows

### Example 1: New Feature Documentation

```text
1. FIG-100 created: "New email template feature"
2. Automation creates DOC-50: "Document email template API"
3. Developer completes FIG-100
4. Doc writer assigned to DOC-50
5. Documentation written, linked to FIG-100
6. Both issues closed when complete
```text

### Example 2: Component Documentation Sprint

```text
1. Create cycle: "Component Docs Sprint"
2. Add tasks:
   - DOC-60: Document CustomTooltip
   - DOC-61: Document Button variants
   - DOC-62: Document Input components
3. Link to FDS issues for each component
4. Track progress via cycle view
5. Close sprint when docs complete
```text

### Example 3: Tutorial Creation

```text
1. DOC-70: "Create CustomTooltip migration tutorial"
2. Link to:
   - RND-25 (research)
   - FIG-42 (implementation)
   - FDS-50 (component)
3. Write tutorial with code examples
4. Publish to docs site
5. Close issue with link to published tutorial
```text

## Questions & Support

### For Linear Setup Questions

- Review RandD documentation (links above)
- Ask in `#linear-help` Slack channel (when created)
- Create issue in RandD team

### For DocuMind-Specific Questions

- Contact RandD team lead
- Review architecture document
- Attend Linear onboarding session (when scheduled)

## Decision Needed

**Question**: How should DocuMind work be tracked in Linear?

**Option A: Dedicated DocuMind Team** (DOC)

- Pros: Clear documentation ownership, focused tracking
- Cons: Extra team to manage
- When: High volume, cross-functional docs

**Option B: Use RandD Team** (RND)

- Pros: Aligned with research/documentation
- Cons: Mixed with R&D work
- When: Low volume, mostly internal docs

**Option C: Use Infrastructure Team** (INF)

- Pros: Technical documentation co-located
- Cons: Mixed with DevOps work
- When: Mostly technical/infrastructure docs

**Recommendation**: Answer the decision matrix questions above, then choose based on volume and type of work.

**Please respond**: Preferred option and reasoning

## Next Steps

1. **Review all documentation** (4 docs in RandD)
2. **Assess documentation work** (volume, type, stakeholders)
3. **Decide on team structure** (dedicated vs existing team)
4. **Set up MCP** when Linear workspace is ready
5. **Test workflows** during team setup
6. **Provide feedback** to improve adoption

## Integration Summary

Linear is being adopted organization-wide for:

- Faster issue tracking
- AI-powered workflows (Claude Code)
- Cross-repository collaboration
- Modern developer experience

## DocuMind's Critical Role

As the **documentation manager**, DocuMind is responsible for:

✅ **Documentation organization** - Scan and reorganize Linear docs globally
✅ **Publishing dispatch** - Distribute documentation updates to all repositories
✅ **Knowledge base management** - Maintain centralized Linear guides
✅ **Workflow documentation** - Create team-specific documentation workflows

**RandD provides**: Technical content and research
**RootDispatcher executes**: Infrastructure deployment
**DocuMind manages**: Documentation organization and publishing

## Documentation Workflow

```text
RandD (Creates technical content)
    ↓ Provides documentation
DocuMind (Organizes & publishes)
    ↓ Dispatches to all repos
All Repositories (Consume documentation)

RootDispatcher (Deploys infrastructure)
    ↓ Notifies DocuMind
DocuMind (Publishes deployment docs)
```text

DocuMind will benefit from Linear for:

- Documentation-to-code linking
- Cross-team visibility
- Faster doc task creation
- Better documentation coverage tracking

**ACTION REQUIRED**: Review documentation and prepare organization strategy (see Action Items above).

**Created**: 2025-11-14
**Status**: Ready for Documentation Management
**Action**: Review all Linear documentation and plan organization strategy

**Your Role**: Primary documentation manager (working in tandem with RootDispatcher)

For questions, contact RandD team for technical content or review documentation in `RandD/docs/`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <<noreply@anthropic.com>)
