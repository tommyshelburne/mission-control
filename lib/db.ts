import Database from 'better-sqlite3';

const DB_PATH = '/home/claw/.openclaw/workspace/mission-control/data/mc.db';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  runMigrations(_db);

  return _db;
}

function runMigrations(db: Database.Database) {
  // Add missing columns to projects (idempotent — catch "duplicate column" errors)
  const addColumn = (table: string, column: string, def: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    } catch {
      // Column already exists — ignore
    }
  };

  addColumn('projects', 'goal', "TEXT DEFAULT ''");
  addColumn('projects', 'due_date', "TEXT DEFAULT ''");
  addColumn('projects', 'updated_at', "TEXT DEFAULT ''");
  addColumn('tasks', 'position', 'REAL DEFAULT 0');

  // Seed position values for any tasks that don't have them yet
  try {
    db.exec(`UPDATE tasks SET position = id WHERE position = 0 OR position IS NULL`);
  } catch { /* ignore */ }

  // Check if tasks table has a CHECK constraint on assignee
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
  if (tableInfo?.sql && /CHECK\s*\(/i.test(tableInfo.sql)) {
    // Recreate tasks table without CHECK constraint
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'todo',
        priority TEXT DEFAULT 'medium',
        assignee TEXT DEFAULT '',
        project TEXT DEFAULT '',
        due_date TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Copy data
    const cols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    const newCols = db.prepare("PRAGMA table_info(tasks_new)").all() as { name: string }[];
    const newColNames = newCols.map(c => c.name);
    const shared = colNames.filter(c => newColNames.includes(c));

    if (shared.length > 0) {
      const colList = shared.join(', ');
      db.exec(`INSERT OR IGNORE INTO tasks_new (${colList}) SELECT ${colList} FROM tasks;`);
      db.exec(`DROP TABLE tasks;`);
      db.exec(`ALTER TABLE tasks_new RENAME TO tasks;`);
    } else {
      db.exec(`DROP TABLE tasks_new;`);
    }
  }
}

export default getDb;
