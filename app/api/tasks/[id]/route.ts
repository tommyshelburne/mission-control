import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const ALLOWED_FIELDS = ['title', 'description', 'status', 'assignee', 'priority', 'project', 'due_date', 'position'];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const body = await request.json();

  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  const db = getDb();
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);
  return NextResponse.json({ success: true });
}
