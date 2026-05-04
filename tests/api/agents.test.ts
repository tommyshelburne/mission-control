import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import { makeTestDb } from '../helpers/test-db';
import { FakeRedis } from '../helpers/fake-redis';
import { jsonRequest, paramsOf } from '../helpers/route';

let db: Database.Database;
let redis: FakeRedis;

vi.mock('@/lib/db', () => ({ getDb: () => db }));
vi.mock('@/lib/redis', () => ({ getRedis: () => redis }));
vi.mock('@/lib/events', () => ({ publishEvent: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  db = makeTestDb();
  redis = new FakeRedis();
});
afterEach(() => {
  db.close();
});

describe('GET /api/agents', () => {
  it('returns empty + threshold when no agents have reported', async () => {
    const { GET } = await import('@/app/api/agents/route');
    const body = await (await GET()).json();
    expect(body).toEqual({ agents: [], stale_threshold_seconds: 300 });
  });

  it('marks agents stale when their heartbeat is older than the threshold', async () => {
    redis.hashes.set('agent:rex:state', {
      name: 'rex',
      status: 'busy',
      last_heartbeat_ms: String(Date.now() - 1000 * 1000),
      current_task_id: '42',
      current_task_title: 'review code',
      current_activity: 'reading',
      model: 'sonnet-4-6',
    });
    redis.hashes.set('agent:claw:state', {
      name: 'claw',
      status: 'idle',
      last_heartbeat_ms: String(Date.now() - 60 * 1000),
      current_task_id: '',
      current_task_title: '',
      current_activity: '',
      model: 'opus-4-7',
    });

    const { GET } = await import('@/app/api/agents/route');
    const body = (await (await GET()).json()) as { agents: Array<{ name: string; effective_status: string }> };
    expect(body.agents).toHaveLength(2);
    const claw = body.agents.find((a) => a.name === 'claw');
    const rex = body.agents.find((a) => a.name === 'rex');
    expect(claw?.effective_status).toBe('idle');
    expect(rex?.effective_status).toBe('offline');
  });
});

describe('GET /api/agents/[name]', () => {
  it('404s when no state hash exists', async () => {
    const { GET } = await import('@/app/api/agents/[name]/route');
    const res = await GET(new Request('http://x/api/agents/missing'), paramsOf({ name: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('returns the agent + recent activity from SQLite', async () => {
    redis.hashes.set('agent:rex:state', {
      name: 'rex',
      status: 'busy',
      last_heartbeat_ms: String(Date.now() - 5_000),
      current_task_id: '7',
      current_task_title: 'patch',
      current_activity: 'editing',
      model: 'sonnet',
    });
    db.prepare(
      "INSERT INTO activity_log (entity_type, entity_id, action, actor, detail) VALUES ('task', 7, 'updated', 'rex', 'edited file')",
    ).run();

    const { GET } = await import('@/app/api/agents/[name]/route');
    const res = await GET(new Request('http://x/api/agents/rex'), paramsOf({ name: 'rex' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.effective_status).toBe('busy');
    expect(body.recent_activity).toHaveLength(1);
    expect(body.recent_activity[0].actor).toBe('rex');
  });
});

describe('POST /api/agents/heartbeat', () => {
  it('writes the state hash and zadd entry', async () => {
    const { POST } = await import('@/app/api/agents/heartbeat/route');
    const res = await POST(
      jsonRequest('http://x/api/agents/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          name: 'rex',
          status: 'busy',
          currentTaskId: 12,
          currentTaskTitle: 'do thing',
          currentActivity: 'working',
          model: 'sonnet',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const hash = await redis.hgetall('agent:rex:state');
    expect(hash).toMatchObject({ name: 'rex', status: 'busy', current_task_id: '12', model: 'sonnet' });
    const zset = redis.zsets.get('agent:heartbeats');
    expect(zset?.has('rex')).toBe(true);
  });

  it('preserves model/activity when caller omits them', async () => {
    redis.hashes.set('agent:rex:state', {
      name: 'rex',
      model: 'opus',
      current_activity: 'previously',
      status: 'idle',
      last_heartbeat_ms: '0',
      current_task_id: '',
      current_task_title: '',
    });

    const { POST } = await import('@/app/api/agents/heartbeat/route');
    await POST(
      jsonRequest('http://x/api/agents/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ name: 'rex', status: 'idle' }),
      }),
    );

    const hash = await redis.hgetall('agent:rex:state');
    expect(hash.model).toBe('opus');
    expect(hash.current_activity).toBe('previously');
  });

  it('rejects an unknown status', async () => {
    const { POST } = await import('@/app/api/agents/heartbeat/route');
    const res = await POST(
      jsonRequest('http://x/api/agents/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ name: 'rex', status: 'maybe' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing name', async () => {
    const { POST } = await import('@/app/api/agents/heartbeat/route');
    const res = await POST(
      jsonRequest('http://x/api/agents/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ status: 'idle' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
