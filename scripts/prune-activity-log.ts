#!/usr/bin/env -S npx tsx
/**
 * Prunes activity_log rows older than the retention window.
 * Daily systemd timer calls this.
 *
 * Retention: 180 days (addendum §5.2).
 * Heartbeat rows are the noisiest source; they get a tighter window (30 days)
 * since historical heartbeats have no operational value beyond recent status.
 */
import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = process.env.MC_DB_PATH ?? path.join(process.cwd(), 'data', 'mc.db');
const GENERAL_RETENTION_DAYS = 180;
const HEARTBEAT_RETENTION_DAYS = 30;

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const prune = db.transaction(() => {
  const heartbeatInfo = db.prepare(
    `DELETE FROM activity_log
     WHERE action = 'heartbeat'
       AND created_at < datetime('now', ?)`,
  ).run(`-${HEARTBEAT_RETENTION_DAYS} days`);

  const generalInfo = db.prepare(
    `DELETE FROM activity_log
     WHERE action != 'heartbeat'
       AND created_at < datetime('now', ?)`,
  ).run(`-${GENERAL_RETENTION_DAYS} days`);

  return { heartbeats: heartbeatInfo.changes, general: generalInfo.changes };
});

const before = (db.prepare('SELECT COUNT(*) c FROM activity_log').get() as { c: number }).c;
const result = prune();
const after = (db.prepare('SELECT COUNT(*) c FROM activity_log').get() as { c: number }).c;

console.log(JSON.stringify({
  before,
  after,
  pruned_heartbeat: result.heartbeats,
  pruned_general: result.general,
  retention: { heartbeat_days: HEARTBEAT_RETENTION_DAYS, general_days: GENERAL_RETENTION_DAYS },
}));

db.close();
