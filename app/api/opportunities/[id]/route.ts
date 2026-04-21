import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'closed'] as const;
const ALLOWED = [
  'title', 'company', 'stage', 'source', 'location', 'salary_min', 'salary_max',
  'url', 'contact', 'notes', 'next_action', 'next_action_date', 'applied_at',
  'closed_reason', 'position',
] as const;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const body = await request.json().catch(() => ({}));
  const db = getDb();

  const existing = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as Record<string, any> | undefined;
  if (!existing) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });

  if (body.stage && !(STAGES as readonly string[]).includes(body.stage)) {
    return NextResponse.json({ error: `stage must be one of ${STAGES.join(', ')}` }, { status: 400 });
  }

  // If stage transitions into applied for the first time, stamp applied_at.
  if (body.stage === 'applied' && !existing.applied_at && !('applied_at' in body)) {
    body.applied_at = new Date().toISOString();
  }

  const updates: string[] = [];
  const values: Record<string, unknown> = { id };
  for (const f of ALLOWED) {
    if (f in body) {
      updates.push(`${f} = @${f}`);
      values[f] = body[f];
    }
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  updates.push(`updated_at = datetime('now')`);

  db.prepare(`UPDATE opportunities SET ${updates.join(', ')} WHERE id = @id`).run(values);
  const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);

  // Log stage transitions to activity.
  if (body.stage && body.stage !== existing.stage) {
    db.prepare(`
      INSERT INTO activity_log (entity_type, entity_id, action, actor, detail)
      VALUES ('project', ?, 'status_changed', 'Tommy', ?)
    `).run(id, JSON.stringify({ kind: 'opportunity', from: existing.stage, to: body.stage, company: existing.company, title: existing.title }));
  }

  return NextResponse.json({ opportunity: row });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const info = db.prepare('DELETE FROM opportunities WHERE id = ?').run(params.id);
  if (info.changes === 0) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
