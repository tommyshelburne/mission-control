import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

const ALLOWED_FIELDS = ['name', 'description', 'goal', 'status', 'color', 'due_date'];

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as { id: number; name: string; status: string } | undefined;

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  await logActivity({
    entity_type: 'project',
    entity_id: project.id,
    action: 'status' in body ? 'status_changed' : 'updated',
    actor: typeof body.actor === 'string' && body.actor ? body.actor : 'Tommy',
    detail: { name: project.name, ...('status' in body ? { to: project.status } : {}) },
  });

  return NextResponse.json({ project });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const id = params.id;
  const actorName = request.nextUrl.searchParams.get('actor') || 'Tommy';

  const existing = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id) as { id: number; name: string } | undefined;

  // Unlink tasks from this project before deleting (FK has ON DELETE SET NULL, but do it explicitly for clarity)
  db.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);

  if (existing) {
    await logActivity({
      entity_type: 'project',
      entity_id: existing.id,
      action: 'deleted',
      actor: actorName,
      detail: { name: existing.name },
    });
  }

  return NextResponse.json({ success: true });
}
