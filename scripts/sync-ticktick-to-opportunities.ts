#!/usr/bin/env -S npx tsx
/**
 * One-way pull: TickTick job leads → opportunities table.
 *
 * - Keyed on tick_tick_id (unique partial index from migration 005).
 * - Idempotent: re-running updates existing rows, inserts new ones, leaves
 *   manually-created opportunities (tick_tick_id IS NULL) untouched.
 * - Conservative: never deletes; if a TickTick task is archived, the synced
 *   row gets stage='closed' but stays in the DB.
 *
 * Usage:
 *   npx tsx scripts/sync-ticktick-to-opportunities.ts
 *   npx tsx scripts/sync-ticktick-to-opportunities.ts --dry
 *
 * Suggested cron cadence: every 15 minutes via openclaw.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fetchTickTickJobs, type TickTickColumn } from '../lib/ticktick';
import { runMigrations } from '../lib/migrations';

const DB_PATH = '/home/claw/.openclaw/workspace/mission-control/data/mc.db';

type Stage = 'applied' | 'screening' | 'interview' | 'offer' | 'closed';

function mapStage(status: TickTickColumn): Stage {
  switch (status) {
    case 'Interview':
      return 'interview';
    case 'Offer':
      return 'offer';
    case 'Archived':
      return 'closed';
    case 'Applying':
    case 'Applied':
    default:
      return 'applied';
  }
}

async function main() {
  const dry = process.argv.includes('--dry');
  const result = await fetchTickTickJobs();

  if (result.error) {
    console.error(JSON.stringify({ ok: false, error: result.error }));
    process.exit(1);
  }

  if (dry) {
    console.log(
      JSON.stringify({
        ok: true,
        dry: true,
        total: result.jobs.length,
        preview: result.jobs.slice(0, 3).map((j) => ({
          id: j.id,
          company: j.company,
          role: j.role,
          stage: mapStage(j.status),
        })),
      }),
    );
    return;
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  // Standalone-safe: apply any pending migrations so we don't depend on the
  // Next server having booted first. Idempotent.
  runMigrations(db);

  const upsert = db.prepare(`
    INSERT INTO opportunities (
      tick_tick_id, title, company, stage, source, notes,
      next_action_date, updated_at
    )
    VALUES (
      @tick_tick_id, @title, @company, @stage, 'ticktick', @notes,
      @next_action_date, datetime('now')
    )
    ON CONFLICT(tick_tick_id) DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      stage = excluded.stage,
      notes = excluded.notes,
      next_action_date = excluded.next_action_date,
      updated_at = datetime('now')
  `);

  const existsQ = db.prepare('SELECT 1 FROM opportunities WHERE tick_tick_id = ?');

  let added = 0;
  let updated = 0;
  const tx = db.transaction(() => {
    for (const job of result.jobs) {
      const existed = !!existsQ.get(job.id);
      upsert.run({
        tick_tick_id: job.id,
        title: job.role || job.company,
        company: job.company,
        stage: mapStage(job.status),
        notes: job.tags.length > 0 ? `tags: ${job.tags.join(', ')}` : '',
        next_action_date: job.dueDate || null,
      });
      if (existed) updated++;
      else added++;
    }
  });
  tx();

  console.log(
    JSON.stringify({
      ok: true,
      dbPath: path.basename(DB_PATH),
      total: result.jobs.length,
      added,
      updated,
    }),
  );

  db.close();
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
