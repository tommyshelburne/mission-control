import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

const SPACING = 1000;
const MIN_GAP = 0.001;

interface ReorderBody {
  taskId: number;
  targetStatus: string;
  targetIndex: number;
  actor?: string;
}

interface TaskRow {
  id: number;
  status: string;
  position: number;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ReorderBody | null;
  if (!body || typeof body.taskId !== 'number' || typeof body.targetStatus !== 'string' || typeof body.targetIndex !== 'number') {
    return NextResponse.json({ error: 'taskId, targetStatus, targetIndex required' }, { status: 400 });
  }
  const { taskId, targetStatus, targetIndex } = body;
  const actor = body.actor || 'Tommy';

  const db = getDb();
  const current = db.prepare('SELECT id, status, position, title FROM tasks WHERE id = ?').get(taskId) as { id: number; status: string; position: number; title: string } | undefined;
  if (!current) return NextResponse.json({ error: 'task not found' }, { status: 404 });

  const statusChanged = current.status !== targetStatus;
  const tx = db.transaction(() => {
    // Sibling tasks in the target column (excluding the moved one).
    const siblings = db.prepare(
      'SELECT id, status, position FROM tasks WHERE status = ? AND id != ? AND parent_id IS NULL ORDER BY position ASC'
    ).all(targetStatus, taskId) as TaskRow[];

    const idx = Math.max(0, Math.min(targetIndex, siblings.length));
    const prev = siblings[idx - 1];
    const next = siblings[idx];

    let newPosition: number;
    if (!prev && !next) {
      newPosition = SPACING;
    } else if (!prev) {
      newPosition = next.position - SPACING;
    } else if (!next) {
      newPosition = prev.position + SPACING;
    } else {
      newPosition = (prev.position + next.position) / 2;
    }

    // If gaps got too tight, rebalance the entire target column (including the moved task at idx).
    const projected: { id: number; position: number }[] = [
      ...siblings.slice(0, idx).map(s => ({ id: s.id, position: s.position })),
      { id: taskId, position: newPosition },
      ...siblings.slice(idx).map(s => ({ id: s.id, position: s.position })),
    ];
    const tightAnywhere = projected.some((p, i) => i > 0 && p.position - projected[i - 1].position < MIN_GAP);
    let movedPosition = newPosition;
    if (tightAnywhere) {
      const update = db.prepare('UPDATE tasks SET position = ?, updated_at = datetime(\'now\') WHERE id = ?');
      projected.forEach((p, i) => {
        const pos = (i + 1) * SPACING;
        if (p.id === taskId) movedPosition = pos;
        else update.run(pos, p.id);
      });
    }

    // Update the moved task (status + position + completed_at lifecycle).
    const fields: string[] = ['status = ?', 'position = ?', "updated_at = datetime('now')"];
    const args: unknown[] = [targetStatus, movedPosition];
    if (statusChanged) {
      if (targetStatus === 'done') fields.push("completed_at = datetime('now')");
      else if (current.status === 'done') fields.push('completed_at = NULL');
    }
    args.push(taskId);
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...args);

    return { movedPosition, statusChanged };
  });

  const { movedPosition, statusChanged: didStatusChange } = tx();

  if (didStatusChange) {
    await logActivity({
      entity_type: 'task',
      entity_id: taskId,
      action: 'status_changed',
      actor,
      detail: { title: current.title, from: current.status, to: targetStatus },
    });
  }

  // Return the full task list so the client can resync from a single source of truth.
  const tasks = db.prepare(
    `SELECT t.*, COALESCE(p.name, '') AS project
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     ORDER BY t.position ASC`
  ).all();

  return NextResponse.json({ tasks, moved: { id: taskId, status: targetStatus, position: movedPosition } });
}
