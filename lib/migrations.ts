import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
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
    const tx = db.transaction(() => {
      db.exec(sql);
      record.run(file);
    });
    tx();
    result.applied.push(file);
  }

  return result;
}
