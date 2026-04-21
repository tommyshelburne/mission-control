# MC v4 Spec — Addendum (Pre-Phase-1 Review)

**Date:** 2026-04-18
**Reviewers:** Hermes (Sonnet 4.6, critical review), Gemini 2.5 Pro (data-migration gap analysis), verified against live v3 DB.
**Purpose:** Correct errors, fill gaps, and resequence Phase 1 before code is written. Read alongside `MC-V4-SPEC.md`.

---

## 1. Corrections to the Spec

| # | Spec text | Problem | Fix |
|---|-----------|---------|-----|
| 1 | `tasks.status TEXT CHECK(IN 'todo',...)` | Invalid SQL. Column name missing from `IN` clause. | `status TEXT CHECK(status IN ('todo',...))`. Apply to `tasks.priority`, `projects.status` too. |
| 2 | "DB migrations: drizzle-kit already supports this" | Drizzle is **not** installed in v3. | **Decision: hand-rolled.** Add `_migrations(id,name,applied_at)` table + SQL files in `lib/migrations/*.sql`. Zero new deps. |
| 3 | `tasks.position INTEGER DEFAULT 0` | v3 uses `REAL`. One row has `position=56.5`; drag-drop reordering routinely produces fractional positions. | Keep v4 as `REAL`. |
| 4 | `projects.color DEFAULT '#5E5CE6'` | v3 default was `'#5b5bd6'`. | **Decision: `'#5E5CE6'` (spec value).** Existing rows keep their colors; new v4 projects use the new default. |
| 5 | `tasks.assignee TEXT DEFAULT 'Tommy'` | v3 default is `''`. 12 existing tasks have empty assignee. | Migration rule: leave empty strings as-is. The v4 default applies only to new rows. |
| 6 | `activity_log.action` enum | Missing `'deleted'` (55 of 257 historical events). | Add `'deleted'` to the enum. |
| 7 | "Next.js 15 + Tailwind v4 + schema migration + SSE" all in Phase 1 | Four independent failure modes in one sprint. | Split — see §4. |
| 8 | "Backup strategy — Phase 4" | Backup needed **before** migration. | Promote to Phase 0. |
| 9 | Agent dashboard "real-time status, last heartbeat" | Heartbeat infra doesn't exist. | **Decision: design heartbeat API + `agents` table in Phase 1.** See §5. |

---

## 2. Verified v3 Ground Truth

Run `python3 -c "..."` against `data/mc.db` to reproduce.

### Tables (4 total)
```
docs          156 rows
projects        7 rows
tasks         100 rows
task_events   257 rows
```

### `task_events.event_type` distribution
```
status_change  106
created         96
deleted         55
```
→ Maps to v4 `activity_log.action`: `status_changed`, `created`, `deleted`.

### `tasks.status` distribution — **all values already in v4 CHECK set**
```
done 93, todo 4, in-progress 2, blocked 1
```

### `tasks.priority` distribution — **all values already in v4 CHECK set**
```
medium 47, high 40, low 12, urgent 1
```

### `projects` rows (authoritative)
```
641   slc-tech-pulse          active
1745  competitive-landscape   active
1746  kombea-outreach         planning
1747  mc-v3.1                 archived
1748  mc-v4.0                 archived    ← prior shelved v4 attempt
1749  gsa-mas                 active
1750  meridian                active
```

### `tasks.project` TEXT distribution (10 distinct values, 100 rows)
```
(empty)           48 rows
kombea-gov        18 rows
Mission Control   12 rows
mc-v3.1            6 rows    ← matches projects.name
kombea-bidmatch    6 rows
kombea-outreach    3 rows    ← matches projects.name
Job Search         3 rows
KomBea             2 rows
u3p                1 row
SLC Tech Pulse     1 row     ← case-mismatch to slc-tech-pulse
```

### `tasks.assignee` distribution
```
Claw 60, Tommy 14, (empty) 12, Rex 8, Quill 3, Scout 2, Coach 1
```

---

## 3. Migration Rules (Explicit)

### 3.1 `tasks.project` (TEXT) → `tasks.project_id` (FK)

**Decision: lump all MC-related strings under one `mission-control` project.** Reactivate project id=1748 (`mc-v4.0`) by renaming it to `mission-control` and setting `status='active'`. Archive mc-v3.1 as a defunct epic.

Per-string mapping, applied in order:

| v3 string | Count | Rule | Result |
|-----------|-------|------|--------|
| `''` (empty) | 48 | Null | `project_id = NULL` |
| `kombea-gov` | 18 | Create new project `kombea-gov` with `status='archived'` | new FK |
| `Mission Control` | 12 | Map to reactivated id=1748 (renamed to `mission-control`) | 1748 |
| `mc-v3.1` | 6 | Map to reactivated id=1748 (lumped under `mission-control`) | 1748 |
| `kombea-bidmatch` | 6 | Create new project `kombea-bidmatch` with `status='archived'` | new FK |
| `kombea-outreach` | 3 | Map to existing id=1746; set its status to `archived` (KomBea exit) | 1746 |
| `Job Search` | 3 | Create new project `job-search` with `status='active'` | new FK |
| `KomBea` | 2 | Create new umbrella project `kombea` with `status='archived'` | new FK |
| `u3p` | 1 | Create new project `u3p` with `status='active'` | new FK |
| `SLC Tech Pulse` | 1 | Case-insensitive match → existing id=641 (`slc-tech-pulse`) | 641 |

**Side effect on `projects`:**
- id=1747 (`mc-v3.1`) stays `archived` — no tasks reference it after migration.
- id=1748 (`mc-v4.0`): rename `name` → `mission-control`, `status` → `active`. All 18 MC-related tasks (12 + 6) point here.
- id=1746 (`kombea-outreach`): status → `archived`.
- 5 new projects created: `kombea-gov`, `kombea-bidmatch`, `job-search`, `kombea`, `u3p`.

### 3.2 `task_events` → `activity_log`

Per-row transform for all 257 historical rows:

```
v4.entity_type = 'task'
v4.entity_id   = v3.task_id
v4.action      = CASE v3.event_type
                   WHEN 'status_change' THEN 'status_changed'
                   WHEN 'created'       THEN 'created'
                   WHEN 'deleted'       THEN 'deleted'
                   ELSE 'updated'  -- guard for future types
                 END
v4.actor       = 'system'        -- unrecoverable
v4.detail      = v3.detail       -- keep as-is; do NOT wrap in JSON. Existing detail is unstructured text; v4's JSON expectation applies only to new rows. If the UI needs structured detail, add a migration helper later.
v4.created_at  = v3.created_at
```

### 3.3 `tasks` backfill for new columns

```
parent_id      NULL
tags           '[]'
source         'manual'     -- ASSUMPTION: we don't know which historical tasks came from agents. If source matters, we can infer from assignee ∈ {Claw,Rex,Quill,Scout,Coach,Hermes}, but that's post-hoc; flag as low-confidence.
source_agent   NULL
completed_at   CASE WHEN status='done' THEN updated_at ELSE NULL END
position       keep v3 REAL value as-is
```

### 3.4 `docs` backfill

```
updated_at     created_at    -- best available baseline
author         'Tommy'
```

### 3.5 `projects` backfill

```
icon           ''            -- choose per-project post-migration
sort_order     0
updated_at     created_at    -- v3 default was '' which is useless
```

---

## 4. Resequenced Phase Plan

### Phase 0: Safety (do first, ~1 day)
- [ ] Snapshot `data/mc.db` to `data/backups/mc.db.v3-pre-migration.YYYYMMDD.bak`
- [ ] Verify snapshot opens cleanly in a fresh process
- [ ] Document rollback procedure: stop service → `cp backup mc.db` → restart → (roll back any Next.js build by `git checkout`)

**Cutover: in-place on port 3000.** No parallel v4 on 3001. Rollback = restore the snapshot + revert code. Keep snapshots for ≥ 30 days post-cutover.

### Phase 1: Schema + Data Migration + Heartbeat API (on **existing** Next 14 / Tailwind 3 / better-sqlite3 stack)
Scope is deliberately narrow: change the data shape, not the framework.
- [ ] Add `_migrations(id,name,applied_at)` table + runner in `lib/migrations.ts`
- [ ] Write `lib/migrations/001_v4_schema.sql` creating v4 tables alongside v3 (new table names: `tasks_v4`, `projects_v4`, `activity_log`, `notifications`, `agents`)
- [ ] Write `scripts/migrate-v3-to-v4.ts` implementing §3 rules (incl. project reactivation of id=1748)
- [ ] Dry-run: migrate into a copy of `mc.db`, diff row counts, spot-check 10 tasks across project mappings
- [ ] Cutover: stop mc service, run migration on live db, rename tables (`tasks`→`tasks_v3_archived`, `tasks_v4`→`tasks`, etc.), restart
- [ ] Verify all existing v3 UI pages still work against renamed tables
- [ ] Ship `POST /api/agents/heartbeat` + `GET /api/agents` endpoints — see §5.1
- [ ] Add heartbeat wrapper script for openclaw cron agents

### Phase 2: API Standardization
- [ ] Define consistent REST shape (query params, bulk ops, error envelope)
- [ ] Add `/api/activity` (replaces `task_events` endpoints)
- [ ] Add `/api/notifications`
- [ ] Agent-facing contract doc — agents that write to v3 must migrate to v4 endpoints

### Phase 3: Framework Upgrade
- [ ] Next 14 → 15 (async params/cookies breaking changes)
- [ ] Tailwind 3 → 4 (config rewrite)
- [ ] Do **not** ship new features during this phase — pure upgrade, pure regression fix

### Phase 4: New Features (incrementally)
Order by value-to-Tommy, not by spec order:
- [ ] **Pipeline v2 first** — Tommy is job-hunting now; any regression risk on the job board hurts daily. Either protect v3 pipeline flow across all phases, or ship v2 early.
- [ ] Quick capture (small, high-value)
- [ ] Notification center (useful once agents start writing)
- [ ] Activity feed + SSE
- [ ] Subtasks
- [ ] Global search + FTS5
- [ ] Agent dashboard — **gated on heartbeat infra**; see §5

### Phase 5: Systemd, Backups, CI
- [ ] Daily `sqlite3 .backup` cron (7-day retention)
- [ ] systemd user unit (already exists — verify it picks up new build)
- [ ] GitHub repo + lint/typecheck CI

---

## 5. Open Risks / Feature Gates

### 5.1 Heartbeat API design (Phase 1 scope)

**New `agents` table:**
```sql
CREATE TABLE agents (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL UNIQUE,        -- 'claw','rex','quill','hermes','scout','coach','warden','herald','sage','pulse','ledger'
  status           TEXT DEFAULT 'offline'       -- 'idle','busy','offline'
                   CHECK(status IN ('idle','busy','offline')),
  current_task_id  INTEGER REFERENCES tasks(id),
  current_activity TEXT DEFAULT '',             -- free-form: "researching gsa-mas leads"
  model            TEXT DEFAULT '',             -- e.g. 'claude-sonnet-4-6'
  last_heartbeat   TEXT,                        -- ISO timestamp
  updated_at       TEXT DEFAULT (datetime('now'))
);
```

Seed rows at migration time for the current roster (claw, rex, quill, hermes, scout, coach, warden, herald, sage, pulse, ledger — 11 agents as of 2026-04-18).

**Endpoints:**
```
POST /api/agents/heartbeat
  body: {name: string, status: 'idle'|'busy'|'offline', currentTaskId?: number, currentActivity?: string, model?: string}
  → upsert on name; updates last_heartbeat = now(); writes activity_log row (entity_type='agent', action='heartbeat')

GET  /api/agents
  → list all agents with computed `staleness_seconds = now - last_heartbeat`
  → UI derives "offline" visually if staleness > 300s regardless of stored status

GET  /api/agents/:name
  → single agent detail for dashboard drill-down
```

**Agent-side integration (openclaw wrapper):**
A bash wrapper `scripts/with-heartbeat.sh` for cron-invoked agents:
```bash
#!/usr/bin/env bash
AGENT_NAME="$1"; shift
MC_URL="${MC_URL:-http://localhost:3000}"
beat() { curl -sf -X POST "$MC_URL/api/agents/heartbeat" -H 'Content-Type: application/json' -d "$1" >/dev/null || true; }
beat "{\"name\":\"$AGENT_NAME\",\"status\":\"busy\"}"
trap 'beat "{\"name\":\"$AGENT_NAME\",\"status\":\"idle\"}"' EXIT
exec "$@"
```

Cron line change: `openclaw agent --agent scout --message ...` → `/home/claw/.openclaw/scripts/with-heartbeat.sh scout openclaw agent --agent scout --message ...`

For agents with in-session tool access (rex via Claude Code, hermes), expose `mc__heartbeat` as an MCP tool so the agent self-reports mid-task.

**UI behavior:** `last_heartbeat > 5 min ago` renders as offline regardless of stored status (protects against crashed-agent lying about being busy).

### 5.2 `activity_log` retention
Agents write continuously. At current rate (257 task_events in v3's lifetime), v4's broader entity coverage will grow faster. Define a retention window (propose 180 days for `activity_log`, unlimited for `notifications.read=0`). Add pruning in Phase 5.

### 5.3 FTS5 + `tags` JSON interaction
Spec says tags are a JSON array and search uses FTS5. `json_each()` filtering doesn't compose with FTS5 natively. Options: (a) denormalize tags into the FTS5 virtual table at write time, (b) tag junction table (abandons the JSON-array decision). Decide before Phase 4.

### 5.4 Subtask recursion
No depth guard in spec. Recommend: cap display at 2 levels; reject inserts where depth > 3 at the API layer.

### 5.5 `position REAL` fractional ordering
Only 1 row uses it today, but drag-drop reordering inserts new fractional positions routinely (e.g., insert between 5 and 6 → 5.5). Keep REAL.

---

## 6. Resolved Decisions (2026-04-18)

1. **MC project consolidation:** lump — rename `mc-v4.0` (id=1748) → `mission-control`, set status=active, point all "Mission Control" + "mc-v3.1" tasks at it. `mc-v3.1` (id=1747) remains archived with zero task references.
2. **Migrations:** hand-rolled (no Drizzle dep).
3. **Cutover:** in-place on :3000. Rollback = restore pre-migration snapshot + revert code.
4. **Heartbeat API:** design and ship in Phase 1 (see §5.1).
5. **Project color default:** `#5E5CE6` (spec value).

---

## 7. Follow-ups (logged, not scoped to Phase 1–3)

### TickTick ↔ opportunities bridge (added 2026-04-19)
Tommy uses TickTick on iPhone to view/add job leads on the go. v4 Pipeline is native, but the phone-side ingress matters — don't delete `/jobs` or break the TickTick flow without a replacement. Design options when it's time to scope this:
1. **One-way push (MC → TickTick):** on `POST /api/opportunities`, create a matching TickTick task in the job project. Simplest. Keeps TickTick as the mobile read surface.
2. **One-way pull (TickTick → MC):** cron script reads TickTick, upserts into `opportunities` for new entries. Works if Tommy adds leads primarily via TickTick on phone.
3. **Two-way sync:** reconciliation by external_id column. Complex; defer.
4. **Minimal:** just add "Open in TickTick" links on opp cards if url matches TickTick format; no sync.

Recommend (2) for phone-first capture or (1) if MC is the source of truth. Either way, add a `tick_tick_id TEXT` column to `opportunities` via migration 004 when this ships.

## 9. What Got Dropped from Gemini's First Pass

For posterity — the first Gemini review hallucinated 6 table names (`Job`, `KeyValue`, `AgentStatus`, `QuickLink`, `SystemMetric`, `Metric`) and API-key middleware that don't exist in v3 or the spec. Root cause: shell `$(cat ...)` substitution was passed literally through the MCP tool call, so Gemini never saw the schema and filled the gap with confabulated ops-dashboard tropes. The retry with inlined content produced the grounded report now reflected above. Lesson: when calling `mcp__gemini__ask_gemini`, inline content directly — no shell expansion.
