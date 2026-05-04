import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { publishEvent } from '@/lib/events';

const VALID_STATUSES = ['idle', 'busy', 'offline'] as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, status, currentTaskId, currentTaskTitle, currentActivity, model } = body as {
    name?: string;
    status?: string;
    currentTaskId?: number | null;
    currentTaskTitle?: string;
    currentActivity?: string;
    model?: string;
  };

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const agentName = name.trim();
  const nowMs = Date.now();
  const redis = getRedis();
  const key = `agent:${agentName}:state`;

  // Read existing hash so we can preserve model/current_activity if caller omits them
  const existing = await redis.hgetall(key);

  const resolvedModel =
    model && model.trim() ? model.trim() : (existing.model ?? '');
  const resolvedActivity =
    currentActivity !== undefined ? currentActivity : (existing.current_activity ?? '');
  const resolvedTaskTitle =
    currentTaskTitle !== undefined ? currentTaskTitle : (existing.current_task_title ?? '');

  await redis.hset(key, {
    name: agentName,
    status,
    last_heartbeat_ms: String(nowMs),
    current_task_id: currentTaskId != null ? String(currentTaskId) : '',
    current_task_title: resolvedTaskTitle,
    current_activity: resolvedActivity,
    model: resolvedModel,
  });

  // Sorted set for fast range queries (score = ms timestamp)
  await redis.zadd('agent:heartbeats', nowMs, agentName);

  const agent = {
    name: agentName,
    status,
    last_heartbeat_ms: nowMs,
    current_task_id: currentTaskId ?? null,
    current_task_title: resolvedTaskTitle,
    current_activity: resolvedActivity,
    model: resolvedModel,
  };

  await publishEvent('agent_status', agent);

  return NextResponse.json({ agent });
}
