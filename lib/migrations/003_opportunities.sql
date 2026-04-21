-- 003_opportunities.sql
-- Job-search pipeline (v4 Pipeline). Tracks opportunities through Applied → Closed.
-- Replaces v3 /pipeline (Pipedrive gov-procurement, scope-archived with KomBea exit).

CREATE TABLE opportunities (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,                        -- role title, e.g. "Senior Frontend Engineer"
  company          TEXT NOT NULL,
  stage            TEXT NOT NULL DEFAULT 'applied'
                   CHECK(stage IN ('applied','screening','interview','offer','closed')),
  source           TEXT DEFAULT '',                      -- 'linkedin','referral','direct','recruiter','other'
  location         TEXT DEFAULT '',                      -- 'SLC','Lehi','Remote','Hybrid'
  salary_min       INTEGER,
  salary_max       INTEGER,
  url              TEXT DEFAULT '',                      -- job posting URL
  contact          TEXT DEFAULT '',                      -- recruiter/referrer name + context
  notes            TEXT DEFAULT '',                      -- markdown free-form
  next_action      TEXT DEFAULT '',                      -- "Send follow-up"
  next_action_date TEXT,                                 -- ISO date for follow-ups
  applied_at       TEXT,                                 -- when moved into applied; set on create if stage='applied'
  closed_reason    TEXT DEFAULT ''
                   CHECK(closed_reason IN ('','rejected','withdrew','accepted','ghosted','declined')),
  position         REAL DEFAULT 0,                       -- kanban ordering within stage
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_opportunities_stage    ON opportunities(stage);
CREATE INDEX idx_opportunities_next     ON opportunities(next_action_date) WHERE next_action_date IS NOT NULL;
CREATE INDEX idx_opportunities_position ON opportunities(stage, position);
