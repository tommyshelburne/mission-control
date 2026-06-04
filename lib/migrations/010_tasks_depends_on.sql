-- Reconcile the task->task dependency column the v2 fleet added out-of-band
-- (~/.openclaw/v2/migrations/2026-05-06-mc-tasks-depends-on.sql) into the
-- numbered chain (triage F11). See 009 for the benign duplicate-column handling.
--
-- The inline FK on an ALTER ADD COLUMN is parsed-but-inert in SQLite, so
-- ON DELETE SET NULL is emulated by the trigger below (matching prod). Cycle /
-- self-reference guards live in the API layer.
ALTER TABLE tasks ADD COLUMN depends_on INTEGER;

CREATE INDEX IF NOT EXISTS idx_tasks_depends_on ON tasks(depends_on);

CREATE TRIGGER IF NOT EXISTS tasks_depends_on_cascade
AFTER DELETE ON tasks
BEGIN
  UPDATE tasks SET depends_on = NULL WHERE depends_on = OLD.id;
END;
