# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This directory is the **mission-control** Next.js app inside the larger OpenClaw workspace. The workspace-level `../CLAUDE.md` covers fleet conventions, git workflow (no `Co-Authored-By: Claude` trailer, no remote, etc.), delegation policy, and memory rules. **Read that file first for anything that isn't strictly about this app's code.**

## Commands

```bash
npm run dev          # next dev (port 3000)
npm run build        # next build
npm run start        # next start
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run — unit + API tests
npm run test:watch   # vitest watch
npm run test:e2e     # playwright (boots its own `npm run start` on port 3010)
npm run test:e2e:ui  # playwright UI mode
```

Run a single vitest file or pattern:

```bash
npx vitest run tests/api/tasks.test.ts
npx vitest run -t "creates a task"
```

CI (`.github/workflows/ci.yml`) runs **lint + typecheck only** — no test job. Catch test regressions locally.

The systemd unit `~/.config/systemd/user/mission-control.service` runs a **production build** on port 3000 — `next build` as `ExecStartPre` then `next start` — not `next dev`. Each restart rebuilds (~14 s); if the build fails the unit stays down rather than serving stale code. Switched 2026-05-27 because long-running `next dev` accumulates swap (HMR module cache) and degrades into "page won't load" after a few days. To do local HMR development without colliding with the unit, run `PORT=3001 npm run dev` or stop the unit first.

Requires Node 22+ and Redis on `127.0.0.1:6379`. Redis password is read from `${OPENCLAW_HOME}/secrets.json` (`redis_password` key) — missing file is tolerated, missing password silently falls back to `""`.

## Path resolution — read this before adding anything that touches the filesystem

Every filesystem path the app reads or writes is derived from two env vars in `lib/paths.ts`:

- `OPENCLAW_HOME` (default `/home/claw/.openclaw`) — holds `secrets.json`, `cron/`, `scripts/usage/`.
- `OPENCLAW_ROOT` (default `$OPENCLAW_HOME/workspace`) — the workspace tree (`projects/`, `memory/`, `agents/`, `mission-control/`).

`DB_PATH` resolves to `${OPENCLAW_ROOT}/mission-control/data/mc.db`. **Never hardcode paths** — import the constant from `lib/paths.ts` or add a new one there. Test setup (`tests/helpers/setup.ts`) redirects both env vars to a tmp dir so accidental real-workspace reads from a test would surface as ENOENT instead of clobbering live data.

## Architecture — what needs cross-file context

### Storage: SQLite + Redis, no ORM

- `lib/db.ts` exposes `getDb()` — a lazy singleton with `journal_mode = WAL` and `foreign_keys = ON`. **`runMigrations()` runs on first call**, so importing `getDb` has a real cost on first use of a process.
- Migrations are hand-rolled SQL files under `lib/migrations/` named `NNN_*.sql`, applied in lexical order. The `_migrations` table tracks applied names. Each runs inside a transaction with the insert.
- **The v3→v4 cutover is not pure SQL.** `001_v4_schema.sql` creates `*_v4` tables alongside v3, then `scripts/migrate-v3-to-v4.ts` copies data and renames. Later migrations (`003_*`, `004_*`, `005_*`, `006_*`) operate on the post-cutover canonical names (`tasks`, `projects`, etc.). There is no `002_*.sql` — that step is the TS script.
- `tests/helpers/test-db.ts` **hand-builds the post-cutover schema** rather than replaying the migration chain (the chain assumes a v3 baseline that test runs don't have). Any SQL change that affects the API surface must be reflected in both `lib/migrations/` AND `tests/helpers/test-db.ts`, or API tests will fail in confusing ways.
- FTS5 search lives in `search_index` (virtual table) with triggers on `tasks`, `projects`, `docs`, `opportunities`. Adding a searchable entity = new triggers in a migration AND in `test-db.ts`.

### Redis: pub for SSE, hashes for agent state

- `lib/redis.ts` `getRedis()` returns a singleton — **publisher / command client only**.
- Subscribers must call `createSubscriberClient()` from `lib/events.ts` — once a Redis client enters subscribe mode it can't issue normal commands, so reusing the singleton would deadlock the next caller.
- Event channel: `mc:events`. Payload shape: `{ type: 'activity' | 'notification' | 'agent_status', payload, ts }`. Producers call `publishEvent()`; publish errors are swallowed (a publish failure must not break the originating write).
- Agent heartbeats write to two Redis structures: hash `agent:<name>:state` (full state snapshot) and sorted set `agent:heartbeats` (score = ms timestamp, for range queries). The `agents` SQL table exists in the schema but the live source of truth is Redis.

### Agents are first-class, agent state is Redis-derived

- `POST /api/agents/heartbeat` is the only writer of agent state. Agents call it via the bash wrapper `scripts/with-heartbeat.sh AGENT_NAME CMD...` which posts `busy` before the command and `idle` on EXIT trap. Don't use `exec` in that wrapper — it replaces the shell and the trap never fires.
- `GET /api/agents` SCANs `agent:*:state` keys (never KEYS) and computes `effective_status` at read time: **anything with `last_heartbeat_ms` older than 5 min reports `offline` regardless of stored status**. This is intentional — agents that crash before sending `idle` shouldn't look busy forever.
- The `currentTaskTitle` / `currentActivity` / `model` fields on the heartbeat POST are **preserved across calls if omitted** (read-modify-write against the existing hash). A heartbeat that just flips `idle`/`busy` keeps the last reported task title.

### SSE stream

`/api/events` is the dashboard's only push channel. The route uses `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, opens a dedicated subscriber client, sends a 25 s comment-line ping (`: ping`), and cleans up on `request.signal` abort. The pub/sub model means **any backend write that goes through `publishEvent()` reaches every connected client** — there's no per-client filtering.

## Testing layout

- `tests/unit/` — pure-function tests (paths, events, migrations runner, ticktick parser).
- `tests/api/` — App Router route handlers exercised directly with `makeTestDb()` + `FakeRedis` (see `tests/helpers/fake-redis.ts` — only implements the methods the routes actually call).
- `tests/e2e/` — Playwright, owned by `playwright.config.ts` (port 3010, boots `npm run start` itself, reuses an existing server outside CI).
- `tests/helpers/setup.ts` — vitest global setup. Forces `OPENCLAW_HOME` / `OPENCLAW_ROOT` to a fresh tmp dir before any test file loads.
- `tests/helpers/route.ts` — utilities for invoking route handlers with constructed `NextRequest`s.

`vitest.config.ts` only includes `tests/unit/**` and `tests/api/**`. Playwright is excluded from the vitest run and vice versa.

## Conventions

- Path alias `@/*` → repo root (`tsconfig.json`, mirrored in `vitest.config.ts`).
- `noUncheckedIndexedAccess` is **not** enabled — `strict` only. Be deliberate about array/object indexing.
- ESLint: unused-args/vars allowed when prefixed `_` (see `eslint.config.mjs`). The `.next/` build output and `coverage/` are ignored.
- `data/` is gitignored (SQLite files live there). `.mcp.json` is also gitignored — it's a per-machine Serena pin, not shared config.
- No auth in this app. The dashboard binds to `0.0.0.0:3000` and trusts Tailscale as the network boundary. Don't add auth middleware speculatively.
