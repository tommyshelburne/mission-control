import Database from 'better-sqlite3';
import { runMigrations } from './migrations';
import { DB_PATH } from './paths';

let _db: Database.Database | null = null;

/**
 * Canonical PRAGMA setup for EVERY connection to mc.db — the server singleton
 * here AND every script that opens its own connection (prune-activity-log,
 * sync-ticktick). Keep this the single source of truth so connections can't
 * drift in lock/checkpoint behaviour (they previously each set a partial subset).
 *
 *   busy_timeout       wait up to 5s for a lock instead of throwing SQLITE_BUSY —
 *                      cron scripts open a 2nd connection against the live server.
 *   wal_autocheckpoint checkpoint every 256 pages (~1MB) so the -wal file does not
 *                      grow unbounded under the long-lived server process.
 */
export function applyPragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('wal_autocheckpoint = 256');
}

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  applyPragmas(_db);

  runMigrations(_db);

  return _db;
}

export default getDb;
