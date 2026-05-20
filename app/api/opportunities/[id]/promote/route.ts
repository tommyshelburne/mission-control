import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createLeadTask } from '@/lib/ticktick';

interface OpportunityRow {
  id: number;
  title: string;
  company: string;
  stage: string;
  url: string;
  notes: string;
  location: string;
  applied_at: string | null;
  tick_tick_id: string | null;
  requires_login: number;
}

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const db = getDb();

  const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as
    | OpportunityRow
    | undefined;
  if (!row) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });

  // Skip TickTick creation if a task already exists for this row — but still
  // run the stage transition below. Bailing here would leave the card stuck in
  // its source column whenever the user re-drags a previously-promoted lead.
  const alreadyHadTickTick = !!row.tick_tick_id;

  let tickTickId: string | null = null;
  let warning: string | null = null;
  let warningDetail: string | null = null;
  if (!alreadyHadTickTick) {
    try {
      const result = await createLeadTask({
        company: row.company,
        title: row.title,
        url: row.url,
        notes: row.notes,
        location: row.location,
        requiresLogin: row.requires_login === 1,
      });
      tickTickId = result.id;
    } catch (err) {
      warning = 'ticktick_create_failed';
      warningDetail = err instanceof Error ? err.message : String(err);
    }
  }

  const appliedAt = row.applied_at ?? new Date().toISOString();
  db.prepare(
    `UPDATE opportunities
       SET stage = 'applied',
           tick_tick_id = COALESCE(@tick_tick_id, tick_tick_id),
           applied_at = @applied_at,
           updated_at = datetime('now')
     WHERE id = @id`,
  ).run({ id, tick_tick_id: tickTickId, applied_at: appliedAt });

  if (row.stage !== 'applied') {
    db.prepare(
      `INSERT INTO activity_log (entity_type, entity_id, action, actor, detail)
       VALUES ('project', ?, 'status_changed', 'Tommy', ?)`,
    ).run(
      id,
      JSON.stringify({
        kind: 'opportunity',
        from: row.stage,
        to: 'applied',
        promoted: true,
        company: row.company,
        title: row.title,
        tick_tick_id: tickTickId ?? row.tick_tick_id,
        ...(warning ? { warning, error: warningDetail } : {}),
      }),
    );
  }

  const updated = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);

  if (warning) {
    return NextResponse.json({ opportunity: updated, warning, detail: warningDetail });
  }
  return NextResponse.json({ opportunity: updated });
}
