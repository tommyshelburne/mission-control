-- 008_opportunities_inbox_stage.sql
-- Add 'inbox' stage for Scout-verified discovered leads (decision pending).
-- Add 'expired' closed_reason for auto-aged inbox rows.
-- Add requires_login column to surface scout verdict 'login_walled_unverified'.
--
-- SQLite cannot ALTER a CHECK constraint, so rebuild the table.
-- The migration runner (lib/migrations.ts:39) wraps this in a transaction,
-- so we do NOT add BEGIN/COMMIT here (nested transactions would error).
-- foreign_keys=OFF inside a transaction is also a no-op in SQLite, so we
-- skip that pragma — there are no FK constraints on opportunities anyway.
--
-- Ordering matters: triggers must exist on opportunities_new BEFORE the
-- INSERT-SELECT so search_index is populated by the AFTER INSERT trigger
-- during the copy (triggers DO fire on INSERT...SELECT in SQLite).

CREATE TABLE opportunities_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  company          TEXT NOT NULL,
  stage            TEXT NOT NULL DEFAULT 'applied'
                   CHECK(stage IN ('inbox','applied','screening','interview','offer','closed')),
  source           TEXT DEFAULT '',
  location         TEXT DEFAULT '',
  salary_min       INTEGER,
  salary_max       INTEGER,
  url              TEXT DEFAULT '',
  contact          TEXT DEFAULT '',
  notes            TEXT DEFAULT '',
  next_action      TEXT DEFAULT '',
  next_action_date TEXT,
  applied_at       TEXT,
  closed_reason    TEXT DEFAULT ''
                   CHECK(closed_reason IN ('','rejected','withdrew','accepted','ghosted','declined','expired')),
  position         REAL DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now')),
  tick_tick_id     TEXT,
  applied_key      TEXT,
  requires_login   INTEGER NOT NULL DEFAULT 0
);

-- Recreate FTS5 triggers (lost when we drop the original opportunities table).
-- Copied verbatim from 004_fts5.sql lines 62-77, retargeted at opportunities_new
-- and renamed during this transition. Final rename happens at the bottom.
CREATE TRIGGER opps_fts_ai_new AFTER INSERT ON opportunities_new BEGIN
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('opportunity', NEW.id, NEW.company || ' — ' || NEW.title,
          COALESCE(NEW.notes, '') || ' ' || COALESCE(NEW.contact, '') || ' ' || COALESCE(NEW.location, ''));
END;

CREATE TRIGGER opps_fts_ad_new AFTER DELETE ON opportunities_new BEGIN
  DELETE FROM search_index WHERE entity_type = 'opportunity' AND entity_id = OLD.id;
END;

CREATE TRIGGER opps_fts_au_new AFTER UPDATE OF title, company, notes, contact, location ON opportunities_new BEGIN
  DELETE FROM search_index WHERE entity_type = 'opportunity' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('opportunity', NEW.id, NEW.company || ' — ' || NEW.title,
          COALESCE(NEW.notes, '') || ' ' || COALESCE(NEW.contact, '') || ' ' || COALESCE(NEW.location, ''));
END;

-- Wipe existing search_index rows for opportunities so the AFTER INSERT
-- trigger can repopulate cleanly without duplicates.
DELETE FROM search_index WHERE entity_type = 'opportunity';

-- Copy data. Triggers on opportunities_new fire and refill search_index.
INSERT INTO opportunities_new (
  id, title, company, stage, source, location, salary_min, salary_max,
  url, contact, notes, next_action, next_action_date, applied_at,
  closed_reason, position, created_at, updated_at, tick_tick_id, applied_key
)
SELECT
  id, title, company, stage, source, location, salary_min, salary_max,
  url, contact, notes, next_action, next_action_date, applied_at,
  closed_reason, position, created_at, updated_at, tick_tick_id, applied_key
FROM opportunities;

DROP TABLE opportunities;
ALTER TABLE opportunities_new RENAME TO opportunities;

-- Triggers renamed to their canonical names from 004.
DROP TRIGGER opps_fts_ai_new;
DROP TRIGGER opps_fts_ad_new;
DROP TRIGGER opps_fts_au_new;

CREATE TRIGGER opps_fts_ai AFTER INSERT ON opportunities BEGIN
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('opportunity', NEW.id, NEW.company || ' — ' || NEW.title,
          COALESCE(NEW.notes, '') || ' ' || COALESCE(NEW.contact, '') || ' ' || COALESCE(NEW.location, ''));
END;

CREATE TRIGGER opps_fts_ad AFTER DELETE ON opportunities BEGIN
  DELETE FROM search_index WHERE entity_type = 'opportunity' AND entity_id = OLD.id;
END;

CREATE TRIGGER opps_fts_au AFTER UPDATE OF title, company, notes, contact, location ON opportunities BEGIN
  DELETE FROM search_index WHERE entity_type = 'opportunity' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('opportunity', NEW.id, NEW.company || ' — ' || NEW.title,
          COALESCE(NEW.notes, '') || ' ' || COALESCE(NEW.contact, '') || ' ' || COALESCE(NEW.location, ''));
END;

-- Recreate indexes from 003 + partial unique indexes from 005/006.
CREATE INDEX idx_opportunities_stage     ON opportunities(stage);
CREATE INDEX idx_opportunities_next      ON opportunities(next_action_date) WHERE next_action_date IS NOT NULL;
CREATE INDEX idx_opportunities_position  ON opportunities(stage, position);
CREATE UNIQUE INDEX idx_opportunities_tick_tick_id
  ON opportunities(tick_tick_id) WHERE tick_tick_id IS NOT NULL;
CREATE UNIQUE INDEX idx_opportunities_applied_key
  ON opportunities(applied_key) WHERE applied_key IS NOT NULL;
