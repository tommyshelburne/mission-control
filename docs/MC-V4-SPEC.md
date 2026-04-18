# Mission Control v4 — Product Spec

## Vision

MC v4 is a ground-up rebuild of the ops dashboard, designed around how it's actually used: one human (Tommy), multiple AI agents (Hermes, Rex, Claw), running 24/7 on a headless Linux server, accessed via Tailscale from a MacBook or iPhone. Every design decision should optimize for that reality — not hypothetical multi-user SaaS patterns.

The core thesis: MC is the **shared workspace** between Tommy and his agents. Agents should be first-class citizens, not afterthoughts bolted onto a human UI.

---

## Architecture

### Keep
- **SQLite** — single-user, single-server, no need for PostgreSQL. WAL mode is already enabled. SQLite is faster, simpler, zero-config, and handles this workload easily.
- **Next.js** — upgrade to Next.js 15 (App Router is already in use). Server components + API routes is the right pattern.
- **Tailwind CSS** — keep, upgrade to v4.
- **Tailscale access** — `0.0.0.0:3000` bound, accessed via Tailscale IP. No auth layer needed beyond Tailscale's network-level security.

### Change
- **Real-time**: Add Server-Sent Events (SSE) for live updates. One `/api/events` endpoint that streams task changes, agent status, notifications. No WebSocket complexity needed for a read-heavy dashboard.
- **API design**: Standardize all endpoints around a consistent pattern. Add bulk operations. Add filtering/sorting query params instead of client-side filtering.
- **DB migrations**: Move from ad-hoc `ALTER TABLE` try/catch to proper versioned migrations (drizzle-kit already supports this).
- **Build target**: `next build` + `next start` behind a systemd user service for persistence. Kill the dev server in production.

### Add
- **systemd user service** — auto-start on boot, restart on crash. No pm2/Docker overhead.
- **Backup strategy** — daily SQLite `.backup` to a timestamped file, pruned to 7 days. Cron job.

---

## Data Model v4

### tasks
```sql
id              INTEGER PRIMARY KEY
title           TEXT NOT NULL
description     TEXT DEFAULT ''
status          TEXT CHECK(IN 'todo','in-progress','done','blocked','archived')
priority        TEXT CHECK(IN 'low','medium','high','urgent')
assignee        TEXT DEFAULT 'Tommy'
project_id      INTEGER REFERENCES projects(id)
parent_id       INTEGER REFERENCES tasks(id)  -- subtask support
due_date        TEXT
tags            TEXT DEFAULT '[]'              -- JSON array
source          TEXT DEFAULT 'manual'          -- 'manual','agent','api'
source_agent    TEXT                           -- which agent created it
position        INTEGER DEFAULT 0             -- board ordering
created_at      TEXT DEFAULT (datetime('now'))
updated_at      TEXT DEFAULT (datetime('now'))
completed_at    TEXT                           -- when status changed to done
```

### projects
```sql
id              INTEGER PRIMARY KEY
name            TEXT NOT NULL UNIQUE
description     TEXT DEFAULT ''
status          TEXT CHECK(IN 'planning','active','paused','completed','archived')
color           TEXT DEFAULT '#5E5CE6'
goal            TEXT DEFAULT ''
due_date        TEXT
icon            TEXT DEFAULT ''               -- lucide icon name
sort_order      INTEGER DEFAULT 0
created_at      TEXT DEFAULT (datetime('now'))
updated_at      TEXT DEFAULT (datetime('now'))
```

### activity_log (replaces task_events)
```sql
id              INTEGER PRIMARY KEY
entity_type     TEXT NOT NULL                 -- 'task','project','agent','system'
entity_id       INTEGER
action          TEXT NOT NULL                 -- 'created','updated','status_changed','commented'
actor           TEXT NOT NULL                 -- 'Tommy','Hermes','Rex','Claw','system'
detail          TEXT DEFAULT ''               -- JSON payload of what changed
created_at      TEXT DEFAULT (datetime('now'))
```

### notifications
```sql
id              INTEGER PRIMARY KEY
title           TEXT NOT NULL
body            TEXT DEFAULT ''
type            TEXT DEFAULT 'info'           -- 'info','warning','action_required','agent_update'
source_agent    TEXT
read            INTEGER DEFAULT 0
action_url      TEXT                          -- deep link into MC
created_at      TEXT DEFAULT (datetime('now'))
```

### docs
Keep as-is, add `updated_at` and `author` columns.

---

## New Features

### 1. Activity Feed (Home page)
Replace the current static home page with a live activity feed showing:
- Recent task changes (who did what, when)
- Agent actions (Hermes created a task, Rex completed a build)
- Notifications requiring attention
- Upcoming due dates

Uses SSE to stream new events in real-time. No manual refresh.

### 2. Agent Dashboard (replaces Team page)
- Real-time agent status: online/offline/busy, current task, last heartbeat
- Per-agent activity timeline
- Agent inbox viewer — see what each agent is working on or waiting for
- Quick actions: assign task to agent, send message to agent

### 3. Subtasks & Task Dependencies
- `parent_id` enables subtask trees
- Collapsible subtask lists on the board view
- Progress indicator on parent tasks (3/5 subtasks done)

### 4. Notification Center
- Bell icon in sidebar header with unread count
- Slide panel showing notifications grouped by time
- Agents can create notifications via API when they need Tommy's attention
- Mark read/dismiss/action buttons

### 5. Quick Capture
- Floating action button (mobile) or keyboard shortcut (desktop) to create a task fast
- Title-only creation, everything else optional
- Auto-assign to inbox/no project

### 6. Pipeline v2 (Job Search)
- Kanban stages: Applied → Screening → Interview → Offer → Closed
- Per-opportunity detail panel with notes, contacts, timeline
- Source tracking (LinkedIn, referral, direct)

### 7. Search
- Global search (Cmd+K) across tasks, projects, docs, memories
- Full-text search on SQLite FTS5 virtual table
- Recent searches, quick filters

---

## UI/UX Overhaul

### Design Principles
1. **Dense but readable** — show more data per screen, less clicking through to detail pages
2. **Mobile-first responsive** — the same app works on iPhone Safari via Tailscale, no separate mobile app
3. **Dark mode only** — it's a personal ops tool on a dev's machine, not a customer-facing product
4. **Keyboard-driven** — Cmd+K search, keyboard nav on boards, quick shortcuts

### Layout Changes
- **Collapsible sidebar** — collapses to icon-only on mobile, expands on desktop
- **Slide panels** — task/project details open in a slide panel over the current view, not a new page (already started with SlidePanel component)
- **Responsive grid** — board view switches to a stacked list on narrow screens
- **Sticky headers** — page headers stick on scroll with context (filters, counts)

### Component Library
Extend the existing ui/ primitives:
- `Toast` — ephemeral success/error messages
- `CommandPalette` — Cmd+K global search and actions
- `Avatar` — agent/user avatars with status indicator
- `Timeline` — vertical activity timeline
- `KanbanColumn` — reusable board column with drag-drop
- `ProgressBar` — for subtask completion
- `NotificationBell` — sidebar notification indicator

---

## Agent Integration

### API Contract
All agent interactions go through REST API with a consistent contract:

```
POST   /api/tasks/agent     — create task (requires source_agent)
PATCH  /api/tasks/:id       — update task
POST   /api/notifications   — create notification for Tommy
GET    /api/tasks?assignee=Rex&status=todo  — query assigned work
POST   /api/activity        — log an action
GET    /api/events           — SSE stream (agents can subscribe too)
```

### Agent Visibility
- Agents can query what other agents are working on via `/api/tasks?assignee=Hermes`
- Activity log shows cross-agent work without agents needing direct communication
- MC becomes the coordination layer — agents read the board state instead of messaging each other

### Webhooks (future)
- Register webhook URLs that fire on task status changes
- Enables agents to react to board changes without polling

---

## Phased Rollout

### Phase 1: Foundation (week 1-2)
- [ ] New DB schema with migrations
- [ ] Data migration script from v3 → v4 (preserve all existing tasks/projects)
- [ ] Systemd service for persistent hosting
- [ ] Upgrade Next.js 15, Tailwind v4
- [ ] Standardized API endpoints with query params

### Phase 2: Core UI (week 3-4)
- [ ] New sidebar with collapsible behavior
- [ ] Activity feed home page with SSE
- [ ] Redesigned task board with slide panel details
- [ ] Subtask support in UI
- [ ] Mobile responsive layout

### Phase 3: Agent & Notifications (week 5-6)
- [ ] Notification system (API + UI)
- [ ] Agent dashboard with live status
- [ ] Global search (Cmd+K + FTS5)
- [ ] Quick capture

### Phase 4: Polish (week 7-8)
- [ ] Pipeline v2 kanban
- [ ] Keyboard shortcuts throughout
- [ ] SQLite backup cron
- [ ] Performance pass (bundle size, SSR optimization)
- [ ] GitHub repo + CI (lint + type check)

---

## Non-Goals
- Multi-user auth (Tailscale is the auth layer)
- PostgreSQL or any external database
- GraphQL (REST is fine for this scale)
- Docker/containerization (systemd is simpler)
- Separate mobile app (responsive web is sufficient)
- WCAG compliance (single-user tool)
- Email notifications (Telegram via openclaw is the notification channel)
