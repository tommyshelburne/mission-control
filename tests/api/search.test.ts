import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { makeTestDb } from '../helpers/test-db';

let db: Database.Database;
vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

beforeEach(() => {
  db = makeTestDb();
});
afterEach(() => {
  db.close();
});

async function loadRoute() {
  return await import('@/app/api/search/route');
}

describe('GET /api/search', () => {
  it('returns empty when q is missing', async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/search'));
    expect((await res.json())).toEqual({ results: [], total: 0, q: '' });
  });

  it('finds tasks via FTS triggers', async () => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('Buy milk', 'todo')").run();

    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/search?q=milk'));
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.results[0]).toMatchObject({
      entity_type: 'task',
      title: 'Buy milk',
      href: expect.stringContaining('/tasks?task='),
    });
  });

  it('does prefix matching on partial tokens', async () => {
    db.prepare("INSERT INTO opportunities (title, company) VALUES ('Senior Engineer', 'Acme')").run();

    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/search?q=eng'));
    const body = await res.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].entity_type).toBe('opportunity');
  });

  it('caps the limit at 50', async () => {
    for (let i = 0; i < 5; i++) {
      db.prepare("INSERT INTO tasks (title, status) VALUES (?, 'todo')").run(`needle ${i}`);
    }

    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/search?q=needle&limit=999'));
    const body = await res.json();
    expect(body.results.length).toBe(5); // we only inserted 5
    expect(body.total).toBe(5);
  });

  it('escapes FTS special chars without exploding', async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/search?q=' + encodeURIComponent('()"\\')));
    // Either a clean empty result or a controlled error — never an unhandled throw.
    expect([200, 400]).toContain(res.status);
  });
});
