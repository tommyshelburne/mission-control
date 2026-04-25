#!/usr/bin/env -S npx tsx
/**
 * One-way pull: TickTick job leads → opportunities table.
 *
 * - Keyed on tick_tick_id (unique partial index from migration 005).
 * - Idempotent: re-running updates existing rows, inserts new ones, leaves
 *   manually-created opportunities (tick_tick_id IS NULL) untouched.
 * - Skips TickTick's "Applying" column — that's a research/watch bucket on
 *   Tommy's side (contains templates like "📋 [MODÈLE]" and watch queries like
 *   "🔍 Veille hebdo"), not actual applications. MC's Pipeline is for engaged
 *   opportunities, so Applying tasks stay TickTick-only.
 * - Prunes tick_tick-sourced rows whose TickTick task has moved out of an
 *   eligible column (deleted, or moved to Applying). Manual-source and
 *   Archived-source rows are preserved. Archived → stage='closed' (kept).
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
import { DB_PATH } from '../lib/paths';

type Stage = 'applied' | 'screening' | 'interview' | 'offer' | 'closed';

function mapStage(status: TickTickColumn): Stage | null {
  switch (status) {
    case 'Applying':
      return null;
    case 'Interview':
      return 'interview';
    case 'Offer':
      return 'offer';
    case 'Archived':
      return 'closed';
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

  const eligible = result.jobs.filter((j) => mapStage(j.status) !== null);
  const skipped = result.jobs.length - eligible.length;

  if (dry) {
    console.log(
      JSON.stringify({
        ok: true,
        dry: true,
        total: result.jobs.length,
        eligible: eligible.length,
        skipped_applying: skipped,
        preview: eligible.slice(0, 3).map((j) => ({
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
    ON CONFLICT(tick_tick_id) WHERE tick_tick_id IS NOT NULL DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      stage = excluded.stage,
      notes = excluded.notes,
      next_action_date = excluded.next_action_date,
      updated_at = datetime('now')
  `);

  const existsQ = db.prepare('SELECT 1 FROM opportunities WHERE tick_tick_id = ?');

  const pruneQ = db.prepare(
    `DELETE FROM opportunities
     WHERE source = 'ticktick'
       AND tick_tick_id IS NOT NULL
       AND tick_tick_id NOT IN (SELECT value FROM json_each(?))`,
  );

  let added = 0;
  let updated = 0;
  let pruned = 0;
  const tx = db.transaction(() => {
    for (const job of eligible) {
      const existed = !!existsQ.get(job.id);
      const stage = mapStage(job.status);
      if (stage === null) continue;
      upsert.run({
        tick_tick_id: job.id,
        title: job.role || job.company,
        company: job.company,
        stage,
        notes: job.tags.length > 0 ? `tags: ${job.tags.join(', ')}` : '',
        next_action_date: job.dueDate || null,
      });
      if (existed) updated++;
      else added++;
    }
    const eligibleIds = JSON.stringify(eligible.map((j) => j.id));
    const res = pruneQ.run(eligibleIds);
    pruned = res.changes;
  });
  tx();

  console.log(
    JSON.stringify({
      ok: true,
      dbPath: path.basename(DB_PATH),
      total: result.jobs.length,
      eligible: eligible.length,
      skipped_applying: skipped,
      added,
      updated,
      pruned,
    }),
  );

  db.close();
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
