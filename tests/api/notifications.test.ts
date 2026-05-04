import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { makeTestDb } from '../helpers/test-db';
import { jsonRequest } from '../helpers/route';

let db: Database.Database;
const publishMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/db', () => ({ getDb: () => db }));
vi.mock('@/lib/events', () => ({ publishEvent: publishMock }));

beforeEach(() => {
  db = makeTestDb();
  publishMock.mockClear();
});
afterEach(() => {
  db.close();
});

async function loadRoute() {
  return await import('@/app/api/notifications/route');
}

describe('GET /api/notifications', () => {
  it('returns empty + zero counts on a fresh DB', async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/notifications'));
    const body = await res.json();
    expect(body).toMatchObject({ notifications: [], total: 0, unread: 0 });
  });

  it('filters by unread=1 and by type', async () => {
    db.prepare(
      "INSERT INTO notifications (title, type, read) VALUES ('a', 'info', 0), ('b', 'warning', 1), ('c', 'info', 0)",
    ).run();

    const { GET } = await loadRoute();
    let body = await (await GET(new Request('http://x/api/notifications?unread=1'))).json();
    expect(body.notifications).toHaveLength(2);
    expect(body.unread).toBe(2);

    body = await (await GET(new Request('http://x/api/notifications?type=warning'))).json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].title).toBe('b');
  });
});

describe('POST /api/notifications', () => {
  it('creates and publishes an event', async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest('http://x/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ title: 'hi', type: 'info' }),
      }),
    );
    expect(res.status).toBe(201);
    expect(publishMock).toHaveBeenCalledWith('notification', expect.objectContaining({ title: 'hi' }));
  });

  it('rejects unknown types', async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest('http://x/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ title: 'hi', type: 'critical' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing title', async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonRequest('http://x/api/notifications', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(400);
  });
});
