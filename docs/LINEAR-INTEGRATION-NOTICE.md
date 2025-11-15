# Linear Integration - Organization Setup

**Date**: 2025-11-14
**From**: RandD Team
**Status**: Ready for Implementation
**Action Required**: Review and prepare for Linear adoption

---

## Summary

The organization is implementing **Linear** as a modern project management platform with AI-powered integration via MCP (Model Context Protocol).

**Key Points**:
- Linear will work **alongside** existing tools (Jira optional)
- Cross-repository issue tracking via **Teams**
- Claude Code integration for AI-powered workflows
- DocuMind may have its own Linear team

---

## What is Linear?

Linear is a high-performance project management platform designed for software teams:

- **Speed**: Sub-50ms response times (vs slow Jira)
- **AI Integration**: Native MCP server for Claude Code
- **Developer UX**: Keyboard-first, minimal clicks
- **Modern API**: GraphQL + TypeScript SDK

---

## Organization Structure

### Linear Workspace: DVWDesign

Five core teams are being set up:

```
1. RandD (RND) → DVWDesign/RandD
2. FigmailAPP (FIG) → FigmailAPP
3. FigmaDSController (FDS) → FigmaDSController
4. Aprimo (APR) → aprimo-dam-api
5. Infrastructure (INF) → All repos
```

### DocuMind Consideration

**Option A**: Add DocuMind team
```
6. DocuMind (DOC) → DVWDesign/DocuMind
```

**Option B**: Use existing team based on work type
```
- Documentation work → RandD team
- Product features → Infrastructure team
- Client work → Aprimo team (if applicable)
```

**Recommendation**: Evaluate DocuMind's scope - if it's primarily documentation/knowledge management, it may fit in RandD or Infrastructure team initially.

---

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
```

### GitHub Integration

Pull requests auto-link to Linear issues:

```markdown
## PR Description
Added API documentation for email templates

Fixes DOC-42
Relates to FIG-100
```

→ Linear automatically links PR and updates both issues

---

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
```

### AI-Powered Issue Creation

```
"Create a documentation task:
- Title: Document CustomTooltip component API
- Team: DocuMind (or RandD if no dedicated team)
- Priority: Medium
- Link to FDS-50"
```

Claude Code creates the issue automatically.

---

## Authentication & Permissions

### User-Level Access

- **One authentication** per developer (OAuth or API key)
- **Access = all teams** you're a member of
- No per-team configuration needed

### Example

```
Developer: sarah@company.com
Member of: RandD, DocuMind (if created), Infrastructure

MCP Access:
✅ Can create/edit issues in all 3 teams
✅ Can link documentation to code issues
✅ Can search across all teams
```

### Security

- Recommended: OAuth (most secure)
- Alternative: Personal API key
- Permissions match Linear role (Admin/Member/Guest)

**Details**: See [LINEAR-MCP-AUTHENTICATION.md](../../RandD/docs/LINEAR-MCP-AUTHENTICATION.md) in RandD repository

---

## Benefits for DocuMind

### 1. Documentation-to-Code Linking

Link documentation work to implementation:

```
Code feature (FIG-100)
  ↓ requires
Documentation (DOC-10)
  ↓ references
Component spec (FDS-50)
```

All tracked and linked in Linear.

### 2. Faster Issue Creation

```
Before: Manual doc task tracking, scattered
After: "Create doc task for new feature" → Done in 5 seconds
```

### 3. Cross-Team Visibility

See when documentation is needed:

```
FIG-100: "New email template feature"
  ↓ automatically creates
DOC-15: "Document email template API"
```

Via automation rules.

### 4. AI-Powered Documentation Tasks

```
# Generate doc tasks from code
"Create documentation tasks for all new FigmailAPP features this sprint"

# Link to code
"Find all undocumented components in FigmaDSController"

# Track progress
"Show documentation completion status across all teams"
```

---

## DocuMind-Specific Use Cases

### Documentation Tracking

```
# Component documentation
DOC-10: Document CustomTooltip
  Links to: FDS-50 (component implementation)

# API documentation
DOC-11: Document REST endpoints
  Links to: FIG-100 (API feature)

# User guides
DOC-12: Update user onboarding guide
  Links to: FIG-101 (new UX)
```

### Knowledge Base Management

```
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
```

### Documentation Sprint Planning

```
# Sprint cycle
Cycle: Documentation Sprint 2025-W47
  ├── DOC-10 (Component docs)
  ├── DOC-11 (API docs)
  ├── DOC-12 (User guides)
  └── DOC-13 (Tutorials)
```

---

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

---

## Action Items for DocuMind Team

### Immediate (This Week)

- [ ] Review this document
- [ ] Review full evaluation: [LINEAR-VS-JIRA-EVALUATION.md](../../RandD/docs/LINEAR-VS-JIRA-EVALUATION.md)
- [ ] Review architecture: [LINEAR-REPOSITORY-ARCHITECTURE.md](../../RandD/docs/LINEAR-REPOSITORY-ARCHITECTURE.md)
- [ ] Assess work volume: Dedicated team vs existing team?

### Short Term (Next 2 Weeks)

- [ ] Set up MCP in Claude Code (5 minutes)
- [ ] Test creating doc tasks
- [ ] Link documentation to code issues
- [ ] Provide feedback on workflow

### Medium Term (Week 5-6)

- [ ] Decide on team structure
- [ ] Define documentation workflows
- [ ] Create issue templates (tutorials, guides, FAQs)
- [ ] Set up automation rules

### Long Term (Month 2+)

- [ ] Migrate active documentation tasks
- [ ] Integrate with code workflows
- [ ] Optimize sprint planning
- [ ] Track documentation coverage

---

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
| Few docs, mostly research | Use RandD team |
| Infra/ops documentation | Use Infrastructure team |
| Product documentation hub | Create DocuMind team |
| Cross-functional docs | Create DocuMind team |
| High volume (15+/week) | Create DocuMind team |

---

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

- App: https://linear.app
- Docs: https://linear.app/docs
- MCP: https://linear.app/docs/mcp
- API: https://linear.app/developers

---

## Documentation-Specific Workflows

### Example 1: New Feature Documentation

```
1. FIG-100 created: "New email template feature"
2. Automation creates DOC-50: "Document email template API"
3. Developer completes FIG-100
4. Doc writer assigned to DOC-50
5. Documentation written, linked to FIG-100
6. Both issues closed when complete
```

### Example 2: Component Documentation Sprint

```
1. Create cycle: "Component Docs Sprint"
2. Add tasks:
   - DOC-60: Document CustomTooltip
   - DOC-61: Document Button variants
   - DOC-62: Document Input components
3. Link to FDS issues for each component
4. Track progress via cycle view
5. Close sprint when docs complete
```

### Example 3: Tutorial Creation

```
1. DOC-70: "Create CustomTooltip migration tutorial"
2. Link to:
   - RND-25 (research)
   - FIG-42 (implementation)
   - FDS-50 (component)
3. Write tutorial with code examples
4. Publish to docs site
5. Close issue with link to published tutorial
```

---

## Questions & Support

### For Linear Setup Questions

- Review RandD documentation (links above)
- Ask in `#linear-help` Slack channel (when created)
- Create issue in RandD team

### For DocuMind-Specific Questions

- Contact RandD team lead
- Review architecture document
- Attend Linear onboarding session (when scheduled)

---

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

---

## Next Steps

1. **Review all documentation** (4 docs in RandD)
2. **Assess documentation work** (volume, type, stakeholders)
3. **Decide on team structure** (dedicated vs existing team)
4. **Set up MCP** when Linear workspace is ready
5. **Test workflows** during team setup
6. **Provide feedback** to improve adoption

---

## Summary

Linear is being adopted organization-wide for:
- Faster issue tracking
- AI-powered workflows (Claude Code)
- Cross-repository collaboration
- Modern developer experience

DocuMind will benefit from:
- Documentation-to-code linking
- Cross-team visibility
- Faster task creation
- Better tracking and metrics

**No immediate action required** - this is advance notice. Prepare for setup when your preferred team structure is decided (Week 5-6).

---

**Created**: 2025-11-14
**Status**: Information Notice
**Action**: Review and make team structure decision

For questions, contact RandD team or review documentation in `RandD/docs/`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com)
