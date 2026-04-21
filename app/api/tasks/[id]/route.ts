import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const ALLOWED_FIELDS = ['title', 'description', 'status', 'assignee', 'priority', 'project_id', 'parent_id', 'due_date', 'position'];

const SELECT_TASK_WITH_PROJECT = `
  SELECT t.*, COALESCE(p.name, '') AS project
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.id = ?
`;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const body = await request.json();
  const db = getDb();

  // 2-level depth cap: a task's parent cannot itself be a subtask, and a task cannot be its own ancestor.
  if ('parent_id' in body) {
    const pid = body.parent_id;
    if (pid != null && pid !== '') {
      const num = Number(pid);
      if (num === Number(id)) {
        return NextResponse.json({ error: 'A task cannot be its own parent' }, { status: 400 });
      }
      const parent = db.prepare('SELECT id, parent_id FROM tasks WHERE id = ?').get(num) as { id: number; parent_id: number | null } | undefined;
      if (!parent) return NextResponse.json({ error: 'parent_id not found' }, { status: 400 });
      if (parent.parent_id != null) return NextResponse.json({ error: 'Cannot nest subtasks more than 2 levels deep' }, { status: 400 });
      // If this task currently has subtasks, it cannot itself become a subtask.
      const hasChildren = db.prepare('SELECT 1 FROM tasks WHERE parent_id = ? LIMIT 1').get(id) as { 1: number } | undefined;
      if (hasChildren) return NextResponse.json({ error: 'Cannot move a parent task under another task' }, { status: 400 });
      body.parent_id = num;
    } else {
      body.parent_id = null;
    }
  }

  // Legacy input: accept `project` string and resolve to project_id.
  if ('project' in body && !('project_id' in body)) {
    const name = (body.project as string) ?? '';
    if (!name.trim()) {
      body.project_id = null;
    } else {
      const row = db.prepare('SELECT id FROM projects WHERE name = ?').get(name.trim()) as { id: number } | undefined;
      body.project_id = row ? row.id : null;
    }
  }

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

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const task = db.prepare(SELECT_TASK_WITH_PROJECT).get(id);
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
