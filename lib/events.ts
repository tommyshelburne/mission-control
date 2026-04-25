import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { getRedis } from './redis';

export const EVENTS_CHANNEL = 'mc:events';

export type EventType = 'activity' | 'notification' | 'agent_status';

export interface MCEvent {
  type: EventType;
  payload: unknown;
  ts: number;
}

export async function publishEvent(type: EventType, payload: unknown): Promise<void> {
  const event: MCEvent = { type, payload, ts: Date.now() };
  try {
    await getRedis().publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch (err) {
    // Publishing must never break the originating write — log and move on.
    console.error('[events] publish failed:', err);
  }
}

function getRedisPassword(): string {
  try {
    const secrets = JSON.parse(readFileSync('/home/claw/.openclaw/secrets.json', 'utf-8')) as Record<string, string>;
    return secrets.redis_password ?? '';
  } catch {
    return '';
  }
}

// Subscribers need a dedicated connection — once a Redis client enters subscribe
// mode it can't issue normal commands, so the singleton in lib/redis.ts is reused
// for publishing only.
export function createSubscriberClient(): Redis {
  return new Redis({
    host: '127.0.0.1',
    port: 6379,
    password: getRedisPassword(),
    lazyConnect: false,
  });
}
