import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const SELECT_TASK_WITH_PROJECT = `
  SELECT t.*, COALESCE(p.name, '') AS project
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
`;

function resolveProjectId(db: ReturnType<typeof getDb>, body: Record<string, unknown>): number | null | undefined {
  if ('project_id' in body) {
    const v = body.project_id;
    return v === null || v === '' ? null : Number(v);
  }
  if ('project' in body) {
    const name = (body.project as string) ?? '';
    if (!name.trim()) return null;
    const row = db.prepare('SELECT id FROM projects WHERE name = ?').get(name.trim()) as { id: number } | undefined;
    return row ? row.id : null;
  }
  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : null;
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

  const db = getDb();

  if (statusFilter && limit !== null) {
    const tasks = db.prepare(
      `${SELECT_TASK_WITH_PROJECT} WHERE t.status = ? ORDER BY t.position ASC LIMIT ? OFFSET ?`
    ).all(statusFilter, limit, offset);
    const total = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get(statusFilter) as { count: number }).count;
    return NextResponse.json({ tasks, total });
  }

  const tasks = db.prepare(`${SELECT_TASK_WITH_PROJECT} ORDER BY t.position ASC`).all();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    title,
    description = '',
    status = 'todo',
    assignee = '',
    priority = 'medium',
    due_date = '',
    parent_id,
  } = body;

  if (!title || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const db = getDb();
  const projectId = resolveProjectId(db, body) ?? null;

  // 2-level depth cap: a task's parent cannot itself be a subtask.
  let parentId: number | null = null;
  if (parent_id != null && parent_id !== '') {
    const parent = db.prepare('SELECT id, parent_id FROM tasks WHERE id = ?').get(Number(parent_id)) as { id: number; parent_id: number | null } | undefined;
    if (!parent) return NextResponse.json({ error: 'parent_id not found' }, { status: 400 });
    if (parent.parent_id != null) return NextResponse.json({ error: 'Cannot nest subtasks more than 2 levels deep' }, { status: 400 });
    parentId = parent.id;
  }

  const minRow = db.prepare('SELECT MIN(position) as minPos FROM tasks WHERE status = ?').get(status) as { minPos: number | null };
  const position = (minRow.minPos ?? 1001) - 1;

  const stmt = db.prepare(`
    INSERT INTO tasks (title, description, status, assignee, priority, project_id, parent_id, due_date, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(title.trim(), description, status, assignee, priority, projectId, parentId, due_date, position);

  const task = db.prepare(`${SELECT_TASK_WITH_PROJECT} WHERE t.id = ?`).get(result.lastInsertRowid);
  return NextResponse.json(task, { status: 201 });
}
