import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

// SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. A numbered migration
// that adds a column already present (e.g. the dispatch / depends_on columns the
// v2 fleet added out-of-band before they were folded into 009/010) raises
// exactly this error, and the schema is already in the target state.
function isDuplicateColumnError(err: unknown): boolean {
  return err instanceof Error && /duplicate column name/i.test(err.message);
}

export function runMigrations(db: Database.Database): MigrationResult {
  const migrationsDir = path.join(process.cwd(), 'lib', 'migrations');

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => (r as { name: string }).name),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  const result: MigrationResult = { applied: [], skipped: [] };
  const record = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) {
      result.skipped.push(file);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      db.transaction(() => {
        db.exec(sql);
        record.run(file);
      })();
    } catch (err) {
      // Treat an already-present column as a benign no-op: record the migration
      // so it is not retried every boot, without re-running its DDL. Any other
      // error is a real failure and must surface (the transaction rolled back).
      if (!isDuplicateColumnError(err)) throw err;
      record.run(file);
    }
    result.applied.push(file);
  }

  return result;
}
