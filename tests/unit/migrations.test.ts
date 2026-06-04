// runMigrations is the one bit of lib/ that's worth testing in isolation —
// the production migrations rely on a v3 baseline that fresh DBs don't have,
// so this test points it at a synthetic migrations dir and verifies the
// applied/skipped bookkeeping.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { runMigrations } from '@/lib/migrations';

let tmpDir: string;
let prevCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-migrate-'));
  fs.mkdirSync(path.join(tmpDir, 'lib', 'migrations'), { recursive: true });
  prevCwd = process.cwd();
  // runMigrations resolves migrations relative to process.cwd(); spy and redirect.
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(prevCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeMigration(name: string, sql: string) {
  fs.writeFileSync(path.join(tmpDir, 'lib', 'migrations', name), sql);
}

describe('runMigrations', () => {
  it('applies migrations in numeric order, then skips them on a second run', () => {
    writeMigration('001_a.sql', 'CREATE TABLE foo (id INTEGER);');
    writeMigration('002_b.sql', 'CREATE TABLE bar (id INTEGER);');

    const db = new Database(':memory:');
    const first = runMigrations(db);
    expect(first.applied).toEqual(['001_a.sql', '002_b.sql']);
    expect(first.skipped).toEqual([]);

    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['001_a.sql', '002_b.sql']);

    // Tables really exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining(['foo', 'bar', '_migrations']));
  });

  it('ignores files that do not match the NNN_*.sql pattern', () => {
    writeMigration('001_first.sql', 'CREATE TABLE one (x INTEGER);');
    writeMigration('not-a-migration.sql', 'CREATE TABLE noise (x INTEGER);');
    writeMigration('001_first.txt', 'should be skipped');

    const db = new Database(':memory:');
    const result = runMigrations(db);
    expect(result.applied).toEqual(['001_first.sql']);

    const userTables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('_migrations', 'sqlite_sequence')",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(userTables).toEqual(['one']);
  });

  it('treats a duplicate column as a benign, recorded no-op (idempotent ADD COLUMN)', () => {
    // Simulates a column already added out-of-band (the v2 fleet's dispatch /
    // depends_on ALTERs): a later numbered migration re-adds it. SQLite has no
    // ADD COLUMN IF NOT EXISTS, so this must record without throwing.
    writeMigration('001_base.sql', 'CREATE TABLE tasks (id INTEGER); ALTER TABLE tasks ADD COLUMN dispatched_at TEXT;');
    writeMigration('002_re_add.sql', 'ALTER TABLE tasks ADD COLUMN dispatched_at TEXT;');

    const db = new Database(':memory:');
    expect(() => runMigrations(db)).not.toThrow();

    const recorded = db
      .prepare('SELECT name FROM _migrations ORDER BY name')
      .all()
      .map((r) => (r as { name: string }).name);
    expect(recorded).toEqual(['001_base.sql', '002_re_add.sql']);

    // Column exists exactly once; a second run skips both.
    const cols = (db.prepare("PRAGMA table_info('tasks')").all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols.filter((c) => c === 'dispatched_at')).toHaveLength(1);
    expect(runMigrations(db).applied).toEqual([]);
  });

  it('rolls back when a migration fails (transaction)', () => {
    writeMigration('001_good.sql', 'CREATE TABLE good (x INTEGER);');
    writeMigration('002_bad.sql', 'CREATE TABLE bad (x INTEGER); INSERT INTO not_a_table VALUES (1);');

    const db = new Database(':memory:');
    expect(() => runMigrations(db)).toThrow();

    // 001 should have committed; 002 must NOT be in _migrations and `bad` table must not exist.
    const recorded = db
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r) => (r as { name: string }).name);
    expect(recorded).toEqual(['001_good.sql']);
    const hasBad = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bad'")
      .get();
    expect(hasBad).toBeUndefined();
  });
});
