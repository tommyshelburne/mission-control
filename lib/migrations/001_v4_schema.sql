-- 001_v4_schema.sql
-- Creates v4 tables alongside v3. Data migration happens in scripts/migrate-v3-to-v4.ts.
-- Cutover renames v3 tables to *_v3_archived and v4 tables to the canonical names.

CREATE TABLE projects_v4 (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  status      TEXT DEFAULT 'active'
              CHECK(status IN ('planning','active','paused','completed','archived')),
  color       TEXT DEFAULT '#5E5CE6',
  goal        TEXT DEFAULT '',
  due_date    TEXT,
  icon        TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tasks_v4 (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  status        TEXT DEFAULT 'todo'
                CHECK(status IN ('todo','in-progress','done','blocked','archived')),
  priority      TEXT DEFAULT 'medium'
                CHECK(priority IN ('low','medium','high','urgent')),
  assignee      TEXT DEFAULT 'Tommy',
  project_id    INTEGER REFERENCES projects_v4(id) ON DELETE SET NULL,
  parent_id     INTEGER REFERENCES tasks_v4(id) ON DELETE SET NULL,
  due_date      TEXT,
  tags          TEXT DEFAULT '[]',
  source        TEXT DEFAULT 'manual'
                CHECK(source IN ('manual','agent','api')),
  source_agent  TEXT,
  position      REAL DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_v4_project   ON tasks_v4(project_id);
CREATE INDEX idx_tasks_v4_parent    ON tasks_v4(parent_id);
CREATE INDEX idx_tasks_v4_status    ON tasks_v4(status);
CREATE INDEX idx_tasks_v4_assignee  ON tasks_v4(assignee);
CREATE INDEX idx_tasks_v4_position  ON tasks_v4(position);

CREATE TABLE activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL
              CHECK(entity_type IN ('task','project','agent','system')),
  entity_id   INTEGER,
  action      TEXT NOT NULL
              CHECK(action IN ('created','updated','status_changed','commented','deleted','heartbeat')),
  actor       TEXT NOT NULL,
  detail      TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_log_entity  ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_actor   ON activity_log(actor);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

CREATE TABLE notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  body          TEXT DEFAULT '',
  type          TEXT DEFAULT 'info'
                CHECK(type IN ('info','warning','action_required','agent_update')),
  source_agent  TEXT,
  read          INTEGER DEFAULT 0,
  action_url    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_read ON notifications(read, created_at DESC);

CREATE TABLE agents (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL UNIQUE,
  status           TEXT DEFAULT 'offline'
                   CHECK(status IN ('idle','busy','offline')),
  current_task_id  INTEGER REFERENCES tasks_v4(id) ON DELETE SET NULL,
  current_activity TEXT DEFAULT '',
  model            TEXT DEFAULT '',
  last_heartbeat   TEXT,
  updated_at       TEXT DEFAULT (datetime('now'))
);

-- Seed the current fleet (as of 2026-04-18). Heartbeat null => agent has never reported.
INSERT INTO agents (name, model) VALUES
  ('claw',   'claude-opus-4-7'),
  ('rex',    'claude-sonnet-4-6'),
  ('quill',  'claude-sonnet-4-6'),
  ('hermes', 'claude-sonnet-4-6'),
  ('scout',  'openrouter/google/gemini-2.0-flash-001'),
  ('coach',  'openrouter/google/gemini-2.0-flash-001'),
  ('warden', 'openrouter/google/gemini-2.5-flash'),
  ('herald', 'openrouter/google/gemini-2.5-flash'),
  ('sage',   'openrouter/google/gemini-2.0-flash-001'),
  ('pulse',  'openrouter/google/gemini-2.0-flash-001'),
  ('ledger', 'openrouter/google/gemini-2.5-flash');

-- docs gets two additive columns; keep table name stable (no _v4 rename needed).
ALTER TABLE docs ADD COLUMN updated_at TEXT DEFAULT '';
ALTER TABLE docs ADD COLUMN author TEXT DEFAULT 'Tommy';
