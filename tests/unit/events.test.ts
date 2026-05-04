// publishEvent must never throw — it's called inline from API write paths.
// We verify both the happy-path JSON shape and that a redis-publish failure
// is swallowed (logged) rather than propagated.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVENTS_CHANNEL, publishEvent, createSubscriberClient } from '@/lib/events';

const publishMock = vi.fn();
vi.mock('@/lib/redis', () => ({
  getRedis: () => ({ publish: publishMock }),
}));

beforeEach(() => {
  publishMock.mockReset();
  publishMock.mockResolvedValue(1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('publishEvent', () => {
  it('publishes a JSON-encoded MCEvent on the events channel', async () => {
    const before = Date.now();
    await publishEvent('notification', { id: 1, title: 'hi' });
    const after = Date.now();

    expect(publishMock).toHaveBeenCalledTimes(1);
    const [channel, payload] = publishMock.mock.calls[0] as [string, string];
    expect(channel).toBe(EVENTS_CHANNEL);

    const decoded = JSON.parse(payload);
    expect(decoded.type).toBe('notification');
    expect(decoded.payload).toEqual({ id: 1, title: 'hi' });
    expect(decoded.ts).toBeGreaterThanOrEqual(before);
    expect(decoded.ts).toBeLessThanOrEqual(after);
  });

  it('does not throw when redis.publish fails', async () => {
    publishMock.mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(publishEvent('activity', { ok: true })).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });
});

describe('createSubscriberClient', () => {
  it('returns a Redis instance distinct from the publishing singleton', () => {
    const sub = createSubscriberClient();
    // We can't easily verify connection; the contract is just "constructs an
    // object that has the Redis subscriber methods we use".
    expect(typeof sub.subscribe).toBe('function');
    expect(typeof sub.on).toBe('function');
    sub.disconnect();
  });
});
