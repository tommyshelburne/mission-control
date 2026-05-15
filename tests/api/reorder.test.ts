// Tests for app/api/tasks/reorder — covers position math, atomic rebalance,
// status transitions, and completed_at lifecycle.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { makeTestDb } from '../helpers/test-db';
import { jsonRequest, readJson } from '../helpers/route';

let db: Database.Database;
vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));
vi.mock('@/lib/events', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  db = makeTestDb();
});
afterEach(() => {
  db.close();
});

async function importReorder() {
  return await import('@/app/api/tasks/reorder/route');
}

function seedTasks(rows: Array<{ id: number; status: string; position: number; title?: string; parent_id?: number | null }>) {
  const stmt = db.prepare(
    'INSERT INTO tasks (id, title, status, position, parent_id) VALUES (?, ?, ?, ?, ?)'
  );
  for (const r of rows) stmt.run(r.id, r.title ?? `Task ${r.id}`, r.status, r.position, r.parent_id ?? null);
}

describe('POST /api/tasks/reorder', () => {
  it('rejects malformed bodies', async () => {
    const { POST } = await importReorder();
    const res = await POST(jsonRequest('http://x/api/tasks/reorder', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });

  it('404s when the task is missing', async () => {
    const { POST } = await importReorder();
    const res = await POST(jsonRequest('http://x/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskId: 999, targetStatus: 'todo', targetIndex: 0 }),
    }));
    expect(res.status).toBe(404);
  });

  it('places a task between two siblings (fractional insertion)', async () => {
    seedTasks([
      { id: 1, status: 'todo', position: 1000 },
      { id: 2, status: 'todo', position: 2000 },
      { id: 3, status: 'todo', position: 3000 },
    ]);
    const { POST } = await importReorder();
    // Move task 3 to index 1 in 'todo' (between 1 and 2).
    const res = await POST(jsonRequest('http://x/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskId: 3, targetStatus: 'todo', targetIndex: 1 }),
    }));
    expect(res.status).toBe(200);
    const body = await readJson<{ moved: { position: number } }>(res);
    expect(body.moved.position).toBeGreaterThan(1000);
    expect(body.moved.position).toBeLessThan(2000);
  });

  it('changes status and sets completed_at on move into done', async () => {
    seedTasks([{ id: 1, status: 'in-progress', position: 1000 }]);
    const { POST } = await importReorder();
    await POST(jsonRequest('http://x/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskId: 1, targetStatus: 'done', targetIndex: 0 }),
    }));
    const row = db.prepare('SELECT status, completed_at FROM tasks WHERE id = 1').get() as { status: string; completed_at: string | null };
    expect(row.status).toBe('done');
    expect(row.completed_at).toBeTruthy();
  });

  it('clears completed_at on move out of done', async () => {
    seedTasks([{ id: 1, status: 'done', position: 1000 }]);
    db.prepare("UPDATE tasks SET completed_at = datetime('now') WHERE id = 1").run();
    const { POST } = await importReorder();
    await POST(jsonRequest('http://x/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskId: 1, targetStatus: 'todo', targetIndex: 0 }),
    }));
    const row = db.prepare('SELECT status, completed_at FROM tasks WHERE id = 1').get() as { status: string; completed_at: string | null };
    expect(row.status).toBe('todo');
    expect(row.completed_at).toBeNull();
  });

  it('atomically rebalances when fractional gaps collapse', async () => {
    // Set up tight gaps: adjacent positions are within MIN_GAP after the next insertion.
    seedTasks([
      { id: 1, status: 'todo', position: 1.0 },
      { id: 2, status: 'todo', position: 1.0001 },
      { id: 3, status: 'in-progress', position: 1000 },
    ]);
    const { POST } = await importReorder();
    const res = await POST(jsonRequest('http://x/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskId: 3, targetStatus: 'todo', targetIndex: 1 }),
    }));
    expect(res.status).toBe(200);
    // After rebalance the three todo tasks should be on the 1000-spaced grid.
    const rows = db.prepare("SELECT id, position FROM tasks WHERE status = 'todo' ORDER BY position ASC").all() as { id: number; position: number }[];
    expect(rows.length).toBe(3);
    expect(rows[0].position).toBe(1000);
    expect(rows[1].position).toBe(2000);
    expect(rows[2].position).toBe(3000);
  });

  it('logs activity on status change', async () => {
    seedTasks([{ id: 1, status: 'todo', position: 1000, title: 'Migrate cluster' }]);
    const { POST } = await importReorder();
    await POST(jsonRequest('http://x/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskId: 1, targetStatus: 'in-progress', targetIndex: 0, actor: 'Tommy' }),
    }));
    const rows = db.prepare("SELECT entity_id, action, actor FROM activity_log WHERE entity_type = 'task'").all() as { entity_id: number; action: string; actor: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity_id: 1, action: 'status_changed', actor: 'Tommy' });
  });

  it('does NOT log activity on same-column reorder', async () => {
    seedTasks([
      { id: 1, status: 'todo', position: 1000 },
      { id: 2, status: 'todo', position: 2000 },
    ]);
    const { POST } = await importReorder();
    await POST(jsonRequest('http://x/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskId: 2, targetStatus: 'todo', targetIndex: 0 }),
    }));
    const count = (db.prepare("SELECT COUNT(*) c FROM activity_log").get() as { c: number }).c;
    expect(count).toBe(0);
  });
});
