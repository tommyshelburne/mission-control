import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const ALLOWED_FIELDS = ['name', 'description', 'goal', 'status', 'color', 'due_date'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getDb();
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

  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const id = params.id;

  // Unlink tasks from this project before deleting
  db.prepare("UPDATE tasks SET project = '' WHERE project = (SELECT name FROM projects WHERE id = ?)").run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);

  return NextResponse.json({ success: true });
}
