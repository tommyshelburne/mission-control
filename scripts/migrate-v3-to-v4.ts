#!/usr/bin/env -S npx tsx
/**
 * v3 → v4 data migration.
 * Usage: npx tsx scripts/migrate-v3-to-v4.ts [--db PATH]
 *
 * 1) Runs lib/migrations (creates tasks_v4, projects_v4, activity_log, notifications, agents; adds docs columns).
 * 2) Applies mapping rules from docs/MC-V4-SPEC-ADDENDUM.md §3.
 * 3) Records itself in _migrations as '002_data_migration.ts' — idempotent.
 *
 * Does NOT rename v3 tables. That's a separate cutover step run manually after dry-run verification.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { runMigrations } from '../lib/migrations';

const MIGRATION_NAME = '002_data_migration.ts';

const args = process.argv.slice(2);
const dbArg = args.indexOf('--db');
const dbPath = dbArg >= 0 ? args[dbArg + 1] : path.join(process.cwd(), 'data', 'mc.db');

console.log(`[migrate] db = ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 1. Schema migrations
const schemaResult = runMigrations(db);
console.log('[migrate] schema applied:', schemaResult.applied);
console.log('[migrate] schema skipped:', schemaResult.skipped);

// 2. Idempotency guard
const already = db
  .prepare('SELECT 1 FROM _migrations WHERE name = ?')
  .get(MIGRATION_NAME);
if (already) {
  console.log(`[migrate] ${MIGRATION_NAME} already applied; exiting.`);
  process.exit(0);
}

// 3. Data migration in one transaction
const tx = db.transaction(() => {
  /* ---------- projects ---------- */
  // Copy existing 7 v3 projects 1:1 into projects_v4 (preserving ids).
  // Then adjust per addendum §3.1.
  const v3Projects = db
    .prepare('SELECT id, name, description, status, color, goal, due_date, created_at FROM projects')
    .all() as any[];

  const insertProject = db.prepare(`
    INSERT INTO projects_v4 (id, name, description, status, color, goal, due_date, icon, sort_order, created_at, updated_at)
    VALUES (@id, @name, @description, @status, @color, @goal, @due_date, '', 0, @created_at, @created_at)
  `);
  for (const p of v3Projects) {
    insertProject.run({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      status: p.status ?? 'active',
      color: p.color || '#5b5bd6', // preserve v3 color values; new rows use v4 default '#5E5CE6'
      goal: p.goal ?? '',
      due_date: p.due_date || null,
      created_at: p.created_at,
    });
  }

  // Rename id=1748 (mc-v4.0) → mission-control, status=active
  db.prepare(`UPDATE projects_v4 SET name='mission-control', status='active', updated_at=datetime('now') WHERE id=1748`).run();
  // Archive id=1746 (kombea-outreach) per 2026-04-18 exit
  db.prepare(`UPDATE projects_v4 SET status='archived', updated_at=datetime('now') WHERE id=1746`).run();

  // Create 5 new projects per addendum §3.1. Let AUTOINCREMENT assign ids.
  const newProjects = [
    { name: 'kombea-gov',       status: 'archived' },
    { name: 'kombea-bidmatch',  status: 'archived' },
    { name: 'job-search',       status: 'active'   },
    { name: 'kombea',           status: 'archived' },
    { name: 'u3p',              status: 'active'   },
  ];
  const insertNewProject = db.prepare(`
    INSERT INTO projects_v4 (name, status) VALUES (?, ?)
  `);
  const newProjectIds: Record<string, number> = {};
  for (const np of newProjects) {
    const info = insertNewProject.run(np.name, np.status);
    newProjectIds[np.name] = info.lastInsertRowid as number;
  }
  console.log('[migrate] new projects created:', newProjectIds);

  /* ---------- tasks.project → project_id mapping ---------- */
  const projectMap: Record<string, number | null> = {
    '':                 null,
    'Mission Control':  1748,              // reactivated mission-control
    'mc-v3.1':          1748,              // lumped under mission-control
    'kombea-outreach':  1746,              // existing, now archived
    'SLC Tech Pulse':   641,               // case-insensitive match to slc-tech-pulse
    'kombea-gov':       newProjectIds['kombea-gov'],
    'kombea-bidmatch':  newProjectIds['kombea-bidmatch'],
    'Job Search':       newProjectIds['job-search'],
    'KomBea':           newProjectIds['kombea'],
    'u3p':              newProjectIds['u3p'],
  };

  /* ---------- tasks ---------- */
  const v3Tasks = db
    .prepare(`SELECT id, title, description, status, priority, assignee, project, due_date, created_at, updated_at, position FROM tasks`)
    .all() as any[];

  const insertTask = db.prepare(`
    INSERT INTO tasks_v4 (
      id, title, description, status, priority, assignee, project_id,
      parent_id, due_date, tags, source, source_agent, position,
      completed_at, created_at, updated_at
    ) VALUES (
      @id, @title, @description, @status, @priority, @assignee, @project_id,
      NULL, @due_date, '[]', 'manual', NULL, @position,
      @completed_at, @created_at, @updated_at
    )
  `);

  let unmapped = 0;
  for (const t of v3Tasks) {
    if (!(t.project in projectMap)) {
      unmapped++;
      console.error(`[migrate]  UNMAPPED project string ${JSON.stringify(t.project)} on task id=${t.id}`);
      throw new Error(`unmapped project string: ${JSON.stringify(t.project)}`);
    }
    insertTask.run({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      status: t.status ?? 'todo',
      priority: t.priority ?? 'medium',
      assignee: t.assignee ?? '',         // preserve empty strings; no 'Tommy' default for historical
      project_id: projectMap[t.project],
      due_date: t.due_date || null,
      position: t.position ?? 0,
      completed_at: t.status === 'done' ? t.updated_at : null,
      created_at: t.created_at,
      updated_at: t.updated_at,
    });
  }

  /* ---------- task_events → activity_log ---------- */
  const eventActionMap: Record<string, string> = {
    'status_change': 'status_changed',
    'created':       'created',
    'deleted':       'deleted',
  };
  const insertActivity = db.prepare(`
    INSERT INTO activity_log (entity_type, entity_id, action, actor, detail, created_at)
    VALUES ('task', @entity_id, @action, 'system', @detail, @created_at)
  `);
  const v3Events = db
    .prepare('SELECT task_id, event_type, detail, created_at FROM task_events ORDER BY id')
    .all() as any[];
  for (const e of v3Events) {
    insertActivity.run({
      entity_id: e.task_id,
      action: eventActionMap[e.event_type] ?? 'updated',
      detail: e.detail ?? '',
      created_at: e.created_at,
    });
  }

  /* ---------- docs backfill ---------- */
  // updated_at column was added with default '' — backfill to created_at for historical rows.
  db.prepare(`UPDATE docs SET updated_at = created_at WHERE updated_at = ''`).run();
  // author default is already 'Tommy' via ALTER TABLE default; no update needed for existing rows.
  // (Actually ALTER TABLE ADD COLUMN with DEFAULT applies to new rows; existing get NULL on some engines.
  //  Normalize: set any NULL/empty author to 'Tommy'.)
  db.prepare(`UPDATE docs SET author = 'Tommy' WHERE author IS NULL OR author = ''`).run();

  /* ---------- record migration ---------- */
  db.prepare(`INSERT INTO _migrations (name) VALUES (?)`).run(MIGRATION_NAME);

  return { unmapped };
});

const result = tx();

/* ---------- verification ---------- */
const counts = (t: string) =>
  (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;

console.log('\n[migrate] === POST-MIGRATION ROW COUNTS ===');
console.log(`  v3 tasks:       ${counts('tasks')}  →  v4 tasks_v4:    ${counts('tasks_v4')}`);
console.log(`  v3 projects:    ${counts('projects')}  →  v4 projects_v4: ${counts('projects_v4')}`);
console.log(`  v3 task_events: ${counts('task_events')}  →  activity_log:  ${counts('activity_log')}`);
console.log(`  docs:           ${counts('docs')}`);
console.log(`  agents (seed):  ${counts('agents')}`);
console.log(`  notifications:  ${counts('notifications')}`);

const projectBreakdown = db
  .prepare(`SELECT p.id, p.name, p.status, COUNT(t.id) n FROM projects_v4 p LEFT JOIN tasks_v4 t ON t.project_id = p.id GROUP BY p.id ORDER BY n DESC`)
  .all();
console.log('\n[migrate] === PROJECT → TASK COUNTS ===');
for (const r of projectBreakdown as any[]) console.log(`  ${r.id.toString().padEnd(5)} ${r.name.padEnd(24)} ${r.status.padEnd(10)} ${r.n}`);

const nullProjectTasks = counts('tasks_v4') - (projectBreakdown as any[]).reduce((s, r) => s + r.n, 0);
console.log(`  (no project_id)          ${nullProjectTasks}`);

const actionBreakdown = db
  .prepare(`SELECT action, COUNT(*) n FROM activity_log GROUP BY action ORDER BY n DESC`)
  .all();
console.log('\n[migrate] === ACTIVITY_LOG ACTION BREAKDOWN ===');
for (const r of actionBreakdown as any[]) console.log(`  ${r.action.padEnd(18)} ${r.n}`);

console.log(`\n[migrate] done. unmapped=${result.unmapped}`);
db.close();
