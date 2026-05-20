-- 006_opportunities_applied_key.sql
-- Stable identifier for rows backfilled from projects/job-search/applied.json
-- (the master ledger). Mirrors the tick_tick_id pattern: partial unique index
-- enforces uniqueness for backfilled rows but allows multiple NULLs for
-- manual / TickTick-sourced opportunities.
--
-- NOTE: the 006 prefix is deliberately shared with 006_agent_cost_daily.sql.
-- The runner keys _migrations on the full filename and sorts lexically, so
-- both run (agent_cost first). This file MUST keep a prefix < 008 because
-- 008_opportunities_inbox_stage.sql rebuilds the table and SELECTs applied_key
-- during its INSERT...SELECT — renaming this to 009 breaks fresh-DB migration.

ALTER TABLE opportunities ADD COLUMN applied_key TEXT;

CREATE UNIQUE INDEX idx_opportunities_applied_key
  ON opportunities(applied_key)
  WHERE applied_key IS NOT NULL;
