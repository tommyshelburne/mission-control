-- 005_opportunities_ticktick_id.sql
-- Add tick_tick_id for one-way TickTick → opportunities pull.
-- Partial unique index: enforces uniqueness for synced rows, but still
-- allows multiple NULLs for manually-created opportunities.

ALTER TABLE opportunities ADD COLUMN tick_tick_id TEXT;

CREATE UNIQUE INDEX idx_opportunities_tick_tick_id
  ON opportunities(tick_tick_id)
  WHERE tick_tick_id IS NOT NULL;
