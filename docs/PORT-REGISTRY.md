# Port Registry Reference

⚠️ **IMPORTANT**: Check port availability before starting servers

## Quick Check

Before starting any dev server, Storybook, or database:

```bash

# Check if port is in use

lsof -i :3000 | grep LISTEN

# View full registry

cat /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/config/port-registry.json

```

## Critical Services (DO NOT KILL without team notification)

| Port | Service | Team | Notes |

| ------ | --------- | ------ | ------- |

| 6006 | Storybook - FigmailAPP | Design System Team | ⚠️ DO NOT KILL |

| 6007 | Storybook - CampaignManager | Design System Team | ⚠️ DO NOT KILL |

| 6008 | Storybook - Figma-Plug-ins | Design System Team | ⚠️ DO NOT KILL |

| 5432 | PostgreSQL | Backend Team | ⚠️ DATABASE |

| 27017 | MongoDB | Backend Team | ⚠️ DATABASE |

| 3001 | Uptime Kuma | DevOps | ⚠️ MONITORING |

## Port Ranges

| Range | Purpose | Examples |

| ------- | --------- | ---------- |

| 3000-3999 | Web servers | Dev servers, frontend apps |

| 4000-4999 | APIs | Backend services |

| 5000-5999 | Databases | PostgreSQL, MongoDB |

| 6000-6099 | Storybook | Component development |

| 9000-9999 | Monitoring | Uptime Kuma, Grafana |

## Available Ports (This Repository)

**Web Servers:** 3002, 3003, 3004, 3005, 3010, 3100, 3200
**APIs:** 4000, 4001, 4002, 4100, 4200
**Storybook:** 6009, 6010, 6011, 6012
**Monitoring:** 9001, 9002, 9100

## Full Documentation

📖 **Complete Port Registry:**

- Location: `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/config/port-registry.json`

- Usage Guide: `/Users/Shared/htdocs/github/DVWDesign/RootDispatcher/docs/PORT-REGISTRY-USAGE.md`

- GitHub: <https://github.com/DESIGN-DVW/RootDispatcher/blob/master/config/port-registry.json>

## Claiming a New Port

1. **Find available port** in your range (see above)

2. **Verify it's free:** `lsof -i :3005`

3. **Update registry** in RootDispatcher

4. **Commit and push** registry changes

5. **Notify team** in Slack #dev-coordination

## Before Killing a Process

```bash

# 1. Find what's using the port

lsof -i :6006

# 2. Check the registry

grep -A 10 '"6006"' /Users/Shared/htdocs/github/DVWDesign/RootDispatcher/config/port-registry.json

# 3. If it's critical (Storybook, Database), DO NOT KILL without team notification

```

## Contact Teams

- **Product Team** (#product-dev): FigmailAPP, CampaignManager

- **Design System Team** (#design-system): Storybook instances ⚠️

- **Email Team** (#email-dev): MJML Dev Server

- **Backend Team** (#backend-dev): Databases ⚠️

- **DevOps** (#devops): Monitoring tools ⚠️

---

**Last Updated:** 2025-11-18
**Maintained By:** RootDispatcher (Level 0)
**Questions:** #dev-coordination on Slack
