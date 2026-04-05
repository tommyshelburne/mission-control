import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : null;
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

  const db = getDb();

  if (statusFilter && limit !== null) {
    const tasks = db.prepare(
      'SELECT * FROM tasks WHERE status = ? ORDER BY position ASC LIMIT ? OFFSET ?'
    ).all(statusFilter, limit, offset);
    const total = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE status = ?').get(statusFilter) as { count: number }).count;
    return NextResponse.json({ tasks, total });
  }

  const tasks = db.prepare('SELECT * FROM tasks ORDER BY position ASC').all();
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
    project = '',
    due_date = '',
  } = body;

  if (!title || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const db = getDb();

  // Place new task at top of its column (position = min - 1)
  const minRow = db.prepare('SELECT MIN(position) as minPos FROM tasks WHERE status = ?').get(status) as { minPos: number | null };
  const position = (minRow.minPos ?? 1001) - 1;

  const stmt = db.prepare(`
    INSERT INTO tasks (title, description, status, assignee, priority, project, due_date, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(title.trim(), description, status, assignee, priority, project, due_date, position);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(task, { status: 201 });
}
