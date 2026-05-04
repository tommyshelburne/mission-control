// Tests for app/api/tasks (and [id]) routes — direct invocation of the
// exported handlers against an in-memory DB.
//
// vi.mock is hoisted, so we can't reference a closure here. Instead, the
// `@/lib/db` mock just exposes a getter that reads a module-level slot we
// populate in beforeEach.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { makeTestDb } from '../helpers/test-db';
import { jsonRequest, paramsOf } from '../helpers/route';

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

async function importTasksRoute() {
  return await import('@/app/api/tasks/route');
}
async function importTaskItemRoute() {
  return await import('@/app/api/tasks/[id]/route');
}

describe('GET /api/tasks', () => {
  it('returns an empty list when there are no tasks', async () => {
    const { GET } = await importTasksRoute();
    const res = await GET(new Request('http://x/api/tasks'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ tasks: [] });
  });

  it('returns tasks ordered by position ASC and joins project name', async () => {
    db.prepare("INSERT INTO projects (name) VALUES ('Alpha')").run();
    db.prepare(
      "INSERT INTO tasks (title, status, position, project_id) VALUES ('B', 'todo', 2, 1), ('A', 'todo', 1, 1)",
    ).run();

    const { GET } = await importTasksRoute();
    const res = await GET(new Request('http://x/api/tasks'));
    const body = await res.json();
    expect(body.tasks).toHaveLength(2);
    expect(body.tasks[0].title).toBe('A');
    expect(body.tasks[0].project).toBe('Alpha');
    expect(body.tasks[1].title).toBe('B');
  });

  it('respects status + limit/offset and returns total', async () => {
    for (let i = 0; i < 5; i++) {
      db.prepare("INSERT INTO tasks (title, status, position) VALUES (?, 'todo', ?)").run(`t${i}`, i);
    }
    db.prepare("INSERT INTO tasks (title, status, position) VALUES ('done1', 'done', 0)").run();

    const { GET } = await importTasksRoute();
    const res = await GET(new Request('http://x/api/tasks?status=todo&limit=2&offset=1'));
    const body = await res.json();
    expect(body.total).toBe(5);
    expect(body.tasks).toHaveLength(2);
    expect(body.tasks[0].title).toBe('t1');
    expect(body.tasks[1].title).toBe('t2');
  });
});

describe('POST /api/tasks', () => {
  it('rejects missing title', async () => {
    const { POST } = await importTasksRoute();
    const res = await POST(jsonRequest('http://x/api/tasks', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/title is required/i);
  });

  it('creates a task with sensible defaults and returns it joined with project', async () => {
    db.prepare("INSERT INTO projects (name) VALUES ('Alpha')").run();
    const { POST } = await importTasksRoute();
    const res = await POST(
      jsonRequest('http://x/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Hello', project: 'Alpha' }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ title: 'Hello', status: 'todo', priority: 'medium', project: 'Alpha' });
    expect(typeof body.id).toBe('number');

    // Position is min - 1 (so the new task sorts to top of its column)
    const minPos = db.prepare("SELECT MIN(position) p FROM tasks WHERE status='todo'").get() as { p: number };
    expect(body.position).toBe(minPos.p);
  });

  it('rejects 3rd-level nesting', async () => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('parent', 'todo'), ('child', 'todo')").run();
    db.prepare('UPDATE tasks SET parent_id = 1 WHERE id = 2').run();

    const { POST } = await importTasksRoute();
    const res = await POST(
      jsonRequest('http://x/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'grandchild', parent_id: 2 }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/2 levels/i);
  });

  it('rejects unknown parent_id', async () => {
    const { POST } = await importTasksRoute();
    const res = await POST(
      jsonRequest('http://x/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'orphan', parent_id: 999 }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/parent_id not found/i);
  });
});

describe('PATCH /api/tasks/[id]', () => {
  beforeEach(() => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('a', 'todo')").run();
  });

  it('updates the status and returns the row', async () => {
    const { PATCH } = await importTaskItemRoute();
    const res = await PATCH(
      jsonRequest('http://x/api/tasks/1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in-progress' }),
      }),
      paramsOf({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('in-progress');
  });

  it('rejects setting parent_id to itself', async () => {
    const { PATCH } = await importTaskItemRoute();
    const res = await PATCH(
      jsonRequest('http://x/api/tasks/1', {
        method: 'PATCH',
        body: JSON.stringify({ parent_id: 1 }),
      }),
      paramsOf({ id: '1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/its own parent/i);
  });

  it('400s when there are no allowed fields to update', async () => {
    const { PATCH } = await importTaskItemRoute();
    const res = await PATCH(
      jsonRequest('http://x/api/tasks/1', { method: 'PATCH', body: JSON.stringify({ unknown: 1 }) }),
      paramsOf({ id: '1' }),
    );
    expect(res.status).toBe(400);
  });

  it('clears dispatch state when assignee changes', async () => {
    db.prepare("UPDATE tasks SET dispatched_at='2026-01-01', dispatch_envelope_id='env-1' WHERE id=1").run();

    const { PATCH } = await importTaskItemRoute();
    await PATCH(
      jsonRequest('http://x/api/tasks/1', {
        method: 'PATCH',
        body: JSON.stringify({ assignee: 'rex' }),
      }),
      paramsOf({ id: '1' }),
    );

    const row = db.prepare('SELECT * FROM tasks WHERE id = 1').get() as { assignee: string; dispatched_at: string | null; dispatch_envelope_id: string | null };
    expect(row.assignee).toBe('rex');
    expect(row.dispatched_at).toBeNull();
    expect(row.dispatch_envelope_id).toBeNull();
  });
});

describe('DELETE /api/tasks/[id]', () => {
  it('deletes the task', async () => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('a', 'todo')").run();
    const { DELETE } = await importTaskItemRoute();
    const res = await DELETE(new Request('http://x/api/tasks/1'), paramsOf({ id: '1' }));
    expect(res.status).toBe(200);
    const remaining = db.prepare('SELECT COUNT(*) c FROM tasks').get() as { c: number };
    expect(remaining.c).toBe(0);
  });
});
