-- Reconcile the dispatch-tracking columns the v2 fleet added to tasks
-- out-of-band (~/.openclaw/v2/migrations/2026-04-30-mc-tasks-dispatch.sql) into
-- the numbered chain, so the tasks schema is owned and documented here rather
-- than living only in a manually-applied script (triage F11).
--
-- On an existing DB the columns already exist. SQLite has no
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so the runner records this as a
-- benign no-op when it hits "duplicate column name" (see lib/migrations.ts) —
-- exactly what the v2 migration's own comment said it relied on. Indexes use
-- IF NOT EXISTS and are therefore safe to re-run.
ALTER TABLE tasks ADD COLUMN dispatched_at TEXT;
ALTER TABLE tasks ADD COLUMN dispatch_envelope_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_v4_dispatch ON tasks(dispatched_at, assignee);
