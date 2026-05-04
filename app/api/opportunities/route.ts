import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'closed'] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stage = searchParams.get('stage');
  const search = searchParams.get('q');

  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (stage) { where.push('stage = @stage'); params.stage = stage; }
  if (search) {
    where.push('(LOWER(title) LIKE @q OR LOWER(company) LIKE @q OR LOWER(contact) LIKE @q)');
    params.q = `%${search.toLowerCase()}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM opportunities ${whereSql}
    ORDER BY stage ASC, position ASC, id DESC
  `).all(params);

  const stageCounts = db.prepare(`
    SELECT stage, COUNT(*) c FROM opportunities GROUP BY stage
  `).all() as Array<{ stage: string; c: number }>;

  return NextResponse.json({ opportunities: rows, stage_counts: Object.fromEntries(stageCounts.map((s) => [s.stage, s.c])) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    title,
    company,
    stage = 'applied',
    source = '',
    location = '',
    salary_min,
    salary_max,
    url = '',
    contact = '',
    notes = '',
    next_action = '',
    next_action_date,
  } = body as {
    title?: unknown; company?: unknown; stage?: string; source?: string; location?: string;
    salary_min?: number | null; salary_max?: number | null; url?: string; contact?: string;
    notes?: string; next_action?: string; next_action_date?: string | null;
  };

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!company || typeof company !== 'string' || !company.trim()) {
    return NextResponse.json({ error: 'company is required' }, { status: 400 });
  }
  if (!(STAGES as readonly string[]).includes(stage)) {
    return NextResponse.json({ error: `stage must be one of ${STAGES.join(', ')}` }, { status: 400 });
  }

  const db = getDb();
  const minPos = (db.prepare('SELECT MIN(position) p FROM opportunities WHERE stage = ?').get(stage) as { p: number | null }).p;
  const position = (minPos ?? 1001) - 1;
  const appliedAt = stage === 'applied' ? new Date().toISOString() : null;

  const info = db.prepare(`
    INSERT INTO opportunities
      (title, company, stage, source, location, salary_min, salary_max, url, contact, notes, next_action, next_action_date, applied_at, position)
    VALUES
      (@title, @company, @stage, @source, @location, @salary_min, @salary_max, @url, @contact, @notes, @next_action, @next_action_date, @applied_at, @position)
  `).run({
    title: title.trim(),
    company: company.trim(),
    stage,
    source,
    location,
    salary_min: salary_min ?? null,
    salary_max: salary_max ?? null,
    url,
    contact,
    notes,
    next_action,
    next_action_date: next_action_date || null,
    applied_at: appliedAt,
    position,
  });

  const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(info.lastInsertRowid);

  db.prepare(`
    INSERT INTO activity_log (entity_type, entity_id, action, actor, detail)
    VALUES ('project', ?, 'created', 'Tommy', ?)
  `).run(info.lastInsertRowid, JSON.stringify({ kind: 'opportunity', title, company, stage }));

  return NextResponse.json({ opportunity: row }, { status: 201 });
}
