-- Give opportunities a first-class activity entity_type (triage F23). They were
-- logged as entity_type='project' with detail {"kind":"opportunity"}, so the
-- activity feed's label join (which keys off entity_type) returned NULL for them.
--
-- SQLite can't ALTER a CHECK constraint, so rebuild activity_log with
-- 'opportunity' added, copy every row (all existing values satisfy the wider
-- CHECK), then reclassify the historical opportunity rows. No triggers/FKs
-- reference activity_log, so the swap is clean. Runs in one transaction.
CREATE TABLE activity_log_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL
              CHECK(entity_type IN ('task','project','opportunity','agent','system')),
  entity_id   INTEGER,
  action      TEXT NOT NULL
              CHECK(action IN ('created','updated','status_changed','commented','deleted','heartbeat')),
  actor       TEXT NOT NULL,
  detail      TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now'))
);

INSERT INTO activity_log_new (id, entity_type, entity_id, action, actor, detail, created_at)
  SELECT id, entity_type, entity_id, action, actor, detail, created_at FROM activity_log;

DROP TABLE activity_log;
ALTER TABLE activity_log_new RENAME TO activity_log;

CREATE INDEX idx_activity_log_entity  ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_actor   ON activity_log(actor);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- Reclassify the historical opportunity rows (detail carries the marker). Real
-- project rows have no such marker and are left as 'project'.
UPDATE activity_log SET entity_type = 'opportunity'
  WHERE entity_type = 'project' AND detail LIKE '%"kind":"opportunity"%';
