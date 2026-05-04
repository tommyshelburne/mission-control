import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { makeTestDb } from '../helpers/test-db';
import { jsonRequest } from '../helpers/route';

let db: Database.Database;
vi.mock('@/lib/db', () => ({
  getDb: () => db,
}));

beforeEach(() => {
  db = makeTestDb();
});
afterEach(() => {
  db.close();
});

async function loadRoute() {
  return await import('@/app/api/opportunities/route');
}

describe('GET /api/opportunities', () => {
  it('returns rows + stage counts grouped by stage', async () => {
    db.prepare(
      "INSERT INTO opportunities (title, company, stage, position) VALUES ('Eng', 'Acme', 'applied', 0), ('PM', 'Beta', 'interview', 0), ('SE', 'Gamma', 'applied', 1)",
    ).run();

    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/opportunities'));
    const body = await res.json();
    expect(body.opportunities).toHaveLength(3);
    expect(body.stage_counts).toEqual({ applied: 2, interview: 1 });
  });

  it('filters by stage and search query', async () => {
    db.prepare(
      "INSERT INTO opportunities (title, company, stage) VALUES ('Eng', 'Acme', 'applied'), ('PM', 'Beta', 'interview'), ('SE', 'AcmeCorp', 'applied')",
    ).run();

    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/opportunities?stage=applied&q=acme'));
    const body = await res.json();
    expect(body.opportunities).toHaveLength(2);
    expect(body.opportunities.every((o: any) => o.stage === 'applied')).toBe(true);
  });
});

describe('POST /api/opportunities', () => {
  async function post(body: unknown) {
    const { POST } = await loadRoute();
    return await POST(
      jsonRequest('http://x/api/opportunities', { method: 'POST', body: JSON.stringify(body) }),
    );
  }

  it('creates a row, sets applied_at, writes activity_log', async () => {
    const res = await post({ title: 'Senior FE', company: 'Acme' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.opportunity).toMatchObject({ title: 'Senior FE', company: 'Acme', stage: 'applied' });
    expect(body.opportunity.applied_at).toBeTruthy();

    const log = db.prepare("SELECT * FROM activity_log WHERE entity_type='project' ORDER BY id DESC LIMIT 1").get() as any;
    expect(log.action).toBe('created');
    expect(JSON.parse(log.detail)).toMatchObject({ kind: 'opportunity', title: 'Senior FE' });
  });

  it('rejects missing title', async () => {
    const res = await post({ company: 'Acme' });
    expect(res.status).toBe(400);
  });

  it('rejects missing company', async () => {
    const res = await post({ title: 'Senior FE' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON body', async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest('http://x/api/opportunities', { method: 'POST', body: 'not json' }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects unknown stage', async () => {
    const res = await post({ title: 't', company: 'c', stage: 'archived' });
    expect(res.status).toBe(400);
  });

  it('does NOT set applied_at when stage != applied', async () => {
    const res = await post({ title: 'PM', company: 'Beta', stage: 'interview' });
    const body = await res.json();
    expect(body.opportunity.applied_at).toBeNull();
  });
});
