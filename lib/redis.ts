import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { SECRETS_FILE } from './paths';

function getRedisPassword(): string {
  try {
    const secrets = JSON.parse(readFileSync(SECRETS_FILE, 'utf-8')) as Record<string, string>;
    return secrets.redis_password ?? '';
  } catch {
    return '';
  }
}

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  _redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    password: getRedisPassword(),
    lazyConnect: false,
  });

  return _redis;
}

export default getRedis;
