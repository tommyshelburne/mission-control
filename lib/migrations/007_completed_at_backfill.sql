-- 007_completed_at_backfill.sql
-- Backfill completed_at for tasks already in 'done' status so the new
-- Tasks page sort (Done column = completed_at DESC) has stable ordering
-- without requiring COALESCE in ORDER BY (which defeats indexes).

UPDATE tasks
SET completed_at = updated_at
WHERE status = 'done' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at DESC);
