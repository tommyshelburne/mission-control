import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

const ALLOWED_FIELDS = ['title', 'description', 'status', 'assignee', 'priority', 'project_id', 'parent_id', 'depends_on', 'due_date', 'position'];

const SELECT_TASK_WITH_PROJECT = `
  SELECT t.*, COALESCE(p.name, '') AS project
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.id = ?
`;

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const body = await request.json();
  const db = getDb();
  const actorName: string = body.actor || (body.source === 'agent' && body.source_agent) || 'Tommy';

  const before = db.prepare('SELECT status, title FROM tasks WHERE id = ?').get(id) as { status: string; title: string } | undefined;

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

  // depends_on: validate target exists, no self-ref, no cycle. Cycles in
  // the dependency graph would strand both tasks behind each other forever.
  if ('depends_on' in body) {
    const dep = body.depends_on;
    if (dep != null && dep !== '') {
      const num = Number(dep);
      if (num === Number(id)) {
        return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 });
      }
      const target = db.prepare('SELECT id FROM tasks WHERE id = ?').get(num) as { id: number } | undefined;
      if (!target) return NextResponse.json({ error: 'depends_on not found' }, { status: 400 });
      // Walk the chain from `num` and ensure we never reach `id`. Cap at 32
      // hops as a runaway-loop guard for already-corrupt graphs.
      let cursor: number | null = num;
      for (let i = 0; i < 32 && cursor != null; i++) {
        const next = db.prepare('SELECT depends_on FROM tasks WHERE id = ?').get(cursor) as { depends_on: number | null } | undefined;
        cursor = next ? next.depends_on : null;
        if (cursor === Number(id)) {
          return NextResponse.json({ error: 'depends_on would create a cycle' }, { status: 400 });
        }
      }
      body.depends_on = num;
    } else {
      body.depends_on = null;
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

  // v2 §14 M7: when assignee changes, null dispatch state so the v2 router
  // re-fires the task on its next tick. Without this, a rejected/reassigned
  // task would stay claimed in mc.db forever and never reach the new owner.
  if ('assignee' in body) {
    const current = db.prepare('SELECT assignee FROM tasks WHERE id = ?').get(id) as { assignee: string } | undefined;
    if (current && current.assignee !== body.assignee) {
      updates.push('dispatched_at = NULL');
      updates.push('dispatch_envelope_id = NULL');
    }
  }

  // completed_at lifecycle: set on transition into 'done', clear on transition out.
  const statusChanged = 'status' in body && before && before.status !== body.status;
  if (statusChanged) {
    if (body.status === 'done') {
      updates.push("completed_at = datetime('now')");
    } else if (before?.status === 'done') {
      updates.push('completed_at = NULL');
    }
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const task = db.prepare(SELECT_TASK_WITH_PROJECT).get(id) as { id: number; title: string } | undefined;
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Activity log: status_changed if status moved, else updated. Skip pure position-only writes
  // (drag/drop reorder) so the activity feed doesn't get spammed by every drag.
  const isPositionOnly = updates.length === 2 && 'position' in body;
  if (!isPositionOnly) {
    await logActivity({
      entity_type: 'task',
      entity_id: task.id,
      action: statusChanged ? 'status_changed' : 'updated',
      actor: actorName,
      detail: statusChanged ? { title: task.title, from: before?.status, to: body.status } : { title: task.title },
    });
  }

  return NextResponse.json(task);
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const db = getDb();
  const url = new URL(request.url);
  const actorName = url.searchParams.get('actor') || 'Tommy';
  const existing = db.prepare('SELECT id, title FROM tasks WHERE id = ?').get(params.id) as { id: number; title: string } | undefined;
  db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);
  if (existing) {
    await logActivity({
      entity_type: 'task',
      entity_id: existing.id,
      action: 'deleted',
      actor: actorName,
      detail: { title: existing.title },
    });
  }
  return NextResponse.json({ success: true });
}
