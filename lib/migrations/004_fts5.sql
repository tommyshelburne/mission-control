-- 004_fts5.sql
-- Unified full-text search index across tasks, projects, docs, opportunities.
-- External-content FTS5 with triggers keeps it in sync.

CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id   UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- tasks triggers
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

-- projects triggers
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

-- docs triggers
CREATE TRIGGER docs_fts_ai AFTER INSERT ON docs BEGIN
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('doc', NEW.id, NEW.title, COALESCE(NEW.content, ''));
END;

CREATE TRIGGER docs_fts_ad AFTER DELETE ON docs BEGIN
  DELETE FROM search_index WHERE entity_type = 'doc' AND entity_id = OLD.id;
END;

CREATE TRIGGER docs_fts_au AFTER UPDATE OF title, content ON docs BEGIN
  DELETE FROM search_index WHERE entity_type = 'doc' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, title, body)
  VALUES ('doc', NEW.id, NEW.title, COALESCE(NEW.content, ''));
END;

-- opportunities triggers
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

-- Backfill existing rows
INSERT INTO search_index(entity_type, entity_id, title, body)
  SELECT 'task', id, title, COALESCE(description, '') FROM tasks;
INSERT INTO search_index(entity_type, entity_id, title, body)
  SELECT 'project', id, name, COALESCE(description, '') || ' ' || COALESCE(goal, '') FROM projects;
INSERT INTO search_index(entity_type, entity_id, title, body)
  SELECT 'doc', id, title, COALESCE(content, '') FROM docs;
INSERT INTO search_index(entity_type, entity_id, title, body)
  SELECT 'opportunity', id, company || ' — ' || title,
         COALESCE(notes, '') || ' ' || COALESCE(contact, '') || ' ' || COALESCE(location, '')
  FROM opportunities;
