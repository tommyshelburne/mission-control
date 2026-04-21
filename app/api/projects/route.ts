import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface ProjectRow {
  id: number;
  name: string;
  description: string;
  goal: string;
  status: string;
  color: string;
  due_date: string;
  created_at: string;
  updated_at: string;
  tasks_open: number;
  tasks_done: number;
  task_count: number;
}

export async function GET() {
  const db = getDb();

  const projects = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status != 'done') as tasks_open,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as tasks_done,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count
      FROM projects p ORDER BY p.created_at DESC`
    )
    .all() as ProjectRow[];

  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = await request.json();

  const name = body.name;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const description = body.description ?? '';
  const goal = body.goal ?? '';
  const status = body.status ?? 'active';
  const color = body.color ?? '#5E5CE6';
  const due_date = body.due_date ?? '';

  const result = db
    .prepare(
      `INSERT INTO projects (name, description, goal, status, color, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(name.trim(), description, goal, status, color, due_date);

  const project = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(result.lastInsertRowid) as Record<string, unknown>;

  return NextResponse.json({ project }, { status: 201 });
}
