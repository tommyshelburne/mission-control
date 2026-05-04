// In-memory Redis-shaped fake. Just enough surface area for the agents and
// agents/heartbeat routes to exercise their happy + stale paths.
//
// We don't aim for full ioredis fidelity — only the methods the routes call,
// and only the semantics those routes care about.

type AnyHash = Record<string, string>;

export class FakeRedis {
  hashes = new Map<string, AnyHash>();
  zsets = new Map<string, Map<string, number>>();
  channels: Array<{ channel: string; payload: string }> = [];

  async hgetall(key: string): Promise<AnyHash> {
    return this.hashes.get(key) ?? {};
  }

  async hset(key: string, fields: AnyHash): Promise<number> {
    const cur = this.hashes.get(key) ?? {};
    let added = 0;
    for (const [k, v] of Object.entries(fields)) {
      if (!(k in cur)) added += 1;
      cur[k] = String(v);
    }
    this.hashes.set(key, cur);
    return added;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const z = this.zsets.get(key) ?? new Map();
    const fresh = !z.has(member);
    z.set(member, score);
    this.zsets.set(key, z);
    return fresh ? 1 : 0;
  }

  async scan(
    cursor: string,
    _matchKw: 'MATCH',
    pattern: string,
    ..._tail: ['COUNT', number]
  ): Promise<[string, string[]]> {
    if (cursor !== '0') return ['0', []];
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const keys = [...this.hashes.keys()].filter((k) => re.test(k));
    return ['0', keys];
  }

  pipeline() {
    const ops: Array<() => Promise<unknown>> = [];
    const builder = {
      hgetall: (key: string) => {
        ops.push(() => this.hgetall(key));
        return builder;
      },
      exec: async () => {
        const results: Array<[Error | null, unknown]> = [];
        for (const op of ops) {
          try {
            results.push([null, await op()]);
          } catch (err) {
            results.push([err as Error, null]);
          }
        }
        return results;
      },
    };
    return builder;
  }

  async publish(channel: string, payload: string): Promise<number> {
    this.channels.push({ channel, payload });
    return 1;
  }

  disconnect() {
    /* noop */
  }
}
