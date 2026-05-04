import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { makeTestDb } from '../helpers/test-db';
import { jsonRequest } from '../helpers/route';

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
  return await import('@/app/api/projects/route');
}

describe('GET /api/projects', () => {
  it('returns empty array when none exist', async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ projects: [] });
  });

  it('returns each project with task counts', async () => {
    db.prepare("INSERT INTO projects (name) VALUES ('Alpha'), ('Bravo')").run();
    db.prepare("INSERT INTO tasks (title, status, project_id) VALUES ('a', 'todo', 1), ('b', 'done', 1), ('c', 'in-progress', 2)").run();

    const { GET } = await loadRoute();
    const body = await (await GET()).json();
    const alpha = body.projects.find((p: any) => p.name === 'Alpha');
    expect(alpha).toMatchObject({ tasks_open: 1, tasks_done: 1, task_count: 2 });
    const bravo = body.projects.find((p: any) => p.name === 'Bravo');
    expect(bravo).toMatchObject({ tasks_open: 1, tasks_done: 0, task_count: 1 });
  });
});

describe('POST /api/projects', () => {
  it('creates a project with sensible defaults', async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest('http://x/api/projects', { method: 'POST', body: JSON.stringify({ name: 'New' }) }) as any,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project).toMatchObject({ name: 'New', status: 'active', color: '#5E5CE6' });
  });

  it('400s without a name', async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest('http://x/api/projects', { method: 'POST', body: JSON.stringify({ name: '' }) }) as any,
    );
    expect(res.status).toBe(400);
  });

  it('rejects duplicate name (unique constraint)', async () => {
    const { POST } = await loadRoute();
    await POST(jsonRequest('http://x/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Dup' }) }) as any);
    await expect(
      POST(jsonRequest('http://x/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Dup' }) }) as any),
    ).rejects.toThrow(/UNIQUE/);
  });
});
