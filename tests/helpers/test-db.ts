// Test DB factory.
//
// Production migrations under lib/migrations/ assume a v3 base (001 ALTERs the
// pre-existing `docs` table) and a TS data-migration step that's not part of
// the SQL chain. So instead of replaying them, we hand-build the post-cutover
// schema here to mirror what `data/mc.db` looks like in production.
//
// Anything API tests touch should be reflected here. Keep it close to
// `sqlite3 data/mc.db .schema` output for the relevant tables.

import Database from 'better-sqlite3';

const SCHEMA_SQL = `
CREATE TABLE projects (
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

CREATE TABLE tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  status        TEXT DEFAULT 'todo'
                CHECK(status IN ('todo','in-progress','done','blocked','archived')),
  priority      TEXT DEFAULT 'medium'
                CHECK(priority IN ('low','medium','high','urgent')),
  assignee      TEXT DEFAULT 'Tommy',
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  parent_id     INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  due_date      TEXT,
  tags          TEXT DEFAULT '[]',
  source        TEXT DEFAULT 'manual'
                CHECK(source IN ('manual','agent','api')),
  source_agent  TEXT,
  position      REAL DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  dispatched_at TEXT,
  dispatch_envelope_id TEXT
);

CREATE INDEX idx_tasks_project   ON tasks(project_id);
CREATE INDEX idx_tasks_parent    ON tasks(parent_id);
CREATE INDEX idx_tasks_status    ON tasks(status);
CREATE INDEX idx_tasks_dispatch  ON tasks(dispatched_at, assignee);

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

CREATE TABLE agents (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL UNIQUE,
  status           TEXT DEFAULT 'offline'
                   CHECK(status IN ('idle','busy','offline')),
  current_task_id  INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  current_activity TEXT DEFAULT '',
  model            TEXT DEFAULT '',
  last_heartbeat   TEXT,
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE docs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  category    TEXT DEFAULT '',
  file_path   TEXT NOT NULL UNIQUE,
  content     TEXT DEFAULT '',
  preview     TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT '',
  author      TEXT DEFAULT 'Tommy'
);

CREATE TABLE opportunities (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  company          TEXT NOT NULL,
  stage            TEXT NOT NULL DEFAULT 'applied'
                   CHECK(stage IN ('applied','screening','interview','offer','closed')),
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
                   CHECK(closed_reason IN ('','rejected','withdrew','accepted','ghosted','declined')),
  position         REAL DEFAULT 0,
  ticktick_id      TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_opportunities_stage    ON opportunities(stage);
CREATE INDEX idx_opportunities_position ON opportunities(stage, position);

CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id   UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61 remove_diacritics 2'
);

CREATE TRIGGER tasks_fts_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('task', NEW.id, NEW.title, COALESCE(NEW.description, ''));
END;
CREATE TRIGGER tasks_fts_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM search_index WHERE entity_type = 'task' AND entity_id = OLD.id;
END;
CREATE TRIGGER tasks_fts_au AFTER UPDATE OF title, description ON tasks BEGIN
  DELETE FROM search_index WHERE entity_type = 'task' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('task', NEW.id, NEW.title, COALESCE(NEW.description, ''));
END;

CREATE TRIGGER projects_fts_ai AFTER INSERT ON projects BEGIN
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('project', NEW.id, NEW.name, COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.goal, ''));
END;
CREATE TRIGGER projects_fts_ad AFTER DELETE ON projects BEGIN
  DELETE FROM search_index WHERE entity_type = 'project' AND entity_id = OLD.id;
END;
CREATE TRIGGER projects_fts_au AFTER UPDATE OF name, description, goal ON projects BEGIN
  DELETE FROM search_index WHERE entity_type = 'project' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('project', NEW.id, NEW.name, COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.goal, ''));
END;

CREATE TRIGGER docs_fts_ai AFTER INSERT ON docs BEGIN
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('doc', NEW.id, NEW.title, COALESCE(NEW.content, ''));
END;
CREATE TRIGGER docs_fts_ad AFTER DELETE ON docs BEGIN
  DELETE FROM search_index WHERE entity_type = 'doc' AND entity_id = OLD.id;
END;

CREATE TRIGGER opps_fts_ai AFTER INSERT ON opportunities BEGIN
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('opportunity', NEW.id, NEW.company || ' — ' || NEW.title,
          COALESCE(NEW.notes, '') || ' ' || COALESCE(NEW.contact, '') || ' ' || COALESCE(NEW.location, ''));
END;
CREATE TRIGGER opps_fts_ad AFTER DELETE ON opportunities BEGIN
  DELETE FROM search_index WHERE entity_type = 'opportunity' AND entity_id = OLD.id;
END;

CREATE TABLE agent_cost_daily (
  agent TEXT NOT NULL,
  day TEXT NOT NULL,
  provider TEXT NOT NULL,
  turns INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  shadow_cost_usd REAL NOT NULL DEFAULT 0,
  rolled_up_at TEXT NOT NULL,
  PRIMARY KEY (agent, day, provider)
);

CREATE TABLE _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO _migrations (name) VALUES
  ('001_v4_schema.sql'),
  ('003_opportunities.sql'),
  ('004_fts5.sql'),
  ('005_opportunities_ticktick_id.sql'),
  ('006_agent_cost_daily.sql');
`;

export type TestDb = Database.Database;

export function makeTestDb(): TestDb {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}
