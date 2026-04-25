# mission-control

A personal ops dashboard. Tasks, projects, an opportunity pipeline, agent fleet status, docs, and memories — one Next.js app running on a headless Linux server, accessed over Tailscale.

Built for an audience of one. Not a SaaS, not a template — every design choice optimizes for one operator on one box.

## Stack

- **Next.js 16** (App Router, server components)
- **better-sqlite3** as the primary store (single-user, single-server, WAL)
- **ioredis** for agent heartbeat state and SSE pub/sub
- **Tailwind CSS 3.4**
- **systemd user service** for persistence

## Routes

| Path | What |
|---|---|
| `/` | Activity feed across tasks, projects, agents |
| `/tasks` | Kanban board with subtasks and slide-panel detail |
| `/projects` | Project rollup with task progress |
| `/pipeline` | Opportunity pipeline (Applied → Screening → Interview → Offer → Closed) |
| `/docs` | Markdown editor over the workspace docs tree, by category or date |
| `/memories` | Daily + longterm notes |
| `/team` | Agent fleet status, derived from heartbeats |
| `/jobs` | TickTick-bridged opportunity inbox |
| `/digest` | Generated daily summary |

## API

REST + SSE. Highlights:

- `GET /api/events` — Server-Sent Events stream over Redis pub/sub. Emits activity / notification / agent_status events.
- `POST /api/agents/heartbeat` — Agents self-report `idle` / `busy` / `offline` plus current task and model.
- `GET /api/agents` — Fleet status with computed staleness (older than 5 min reads as offline regardless of stored status).
- `GET /api/activity`, `POST /api/activity` — Append-only activity log, queryable by entity, actor, action, since-timestamp.
- `GET /api/notifications`, `POST /api/notifications` — Notification center.
- `POST /api/docs/archive` — Move docs into the nearest `.archive/` directory (non-destructive).
- Search via `/api/search` (FTS5).

## Setup

Requires Node 22+, Redis on `127.0.0.1:6379`, and a writable workspace tree.

```bash
git clone https://github.com/tommyshelburne/mission-control
cd mission-control
npm install
# Point at your workspace layout (defaults assume the original deploy at
# /home/claw/.openclaw — see lib/paths.ts for everything that gets read).
export OPENCLAW_HOME=/path/to/.openclaw
export OPENCLAW_ROOT=$OPENCLAW_HOME/workspace
npm run build
npm run start
```

The systemd unit (not in this repo) runs `next start` on port 3000 bound to `0.0.0.0`, reachable via Tailscale. There is no auth layer beyond Tailscale's network identity.

## Development

```bash
npm run dev          # next dev
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test:e2e     # playwright visual regression
```

CI runs lint + typecheck on every push and PR.

## Architecture notes

- **Single user, single server.** SQLite over Postgres, systemd over Docker, Tailscale over an auth middleware. Migrations are hand-rolled (`lib/migrations/`) — no Drizzle / Prisma.
- **Agents are first-class.** The activity log is the shared workspace between the operator and the agent fleet. Agents heartbeat via a small bash wrapper, write tasks through the same REST endpoints the UI uses, and coordinate by reading board state instead of messaging each other.
- **Real-time without WebSockets.** SSE over Redis pub/sub is enough for a read-heavy dashboard.

## Non-goals

Multi-user auth, PostgreSQL, GraphQL, Docker/containerization, a separate mobile app, WCAG compliance, email notifications. All deliberate.

## License

Personal project, no license granted. Read the source freely; copying parts for your own ops dashboard is fine.
