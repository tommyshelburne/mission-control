import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { makeTestDb } from '../helpers/test-db';

let db: Database.Database;
vi.mock('@/lib/db', () => ({ getDb: () => db }));

beforeEach(() => {
  db = makeTestDb();
});
afterEach(() => {
  db.close();
});

describe('GET /api/health', () => {
  it('returns ok status, counts, and the migration list', async () => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('t', 'todo')").run();
    db.prepare("INSERT INTO projects (name) VALUES ('p')").run();

    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('v4');
    expect(body.counts.tasks).toBe(1);
    expect(body.counts.projects).toBe(1);
    expect(body.migrations).toEqual(
      expect.arrayContaining([
        '001_v4_schema.sql',
        '003_opportunities.sql',
        '004_fts5.sql',
      ]),
    );
  });
});
