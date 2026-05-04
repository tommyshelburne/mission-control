import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../helpers/test-db';

describe('test infrastructure', () => {
  it('vitest is wired up', () => {
    expect(1 + 1).toBe(2);
  });

  it('makeTestDb produces a queryable in-memory DB', () => {
    const db = makeTestDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(['tasks', 'projects', 'opportunities', 'docs', 'notifications', 'agents']),
    );
    db.close();
  });

  it('OPENCLAW_HOME is redirected to a tmp dir', () => {
    expect(process.env.OPENCLAW_HOME).toMatch(/mc-test-/);
  });
});
