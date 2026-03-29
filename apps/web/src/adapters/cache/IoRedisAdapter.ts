import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';

/**
 * Native Redis adapter using ioredis (TCP connection).
 *
 * Used for K8s in-cluster Redis (2A-21).
 * Set REDIS_URL=redis://thunder-redis:6379 in the pod env.
 *
 * Requires: npm install ioredis  (see apps/web/package.json)
 */
export class IoRedisAdapter implements ICacheAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _client: any;

  constructor(redisUrl: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis');
    this._client = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });
    this._client.on('error', (err: unknown) => {
      console.error('[IoRedisAdapter] Redis error', err);
    });
  }

  async get(key: string): Promise<string | null> {
    return this._client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this._client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this._client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this._client.del(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const count: number = await this._client.incr(key);
    if (ttlSeconds && count === 1) {
      await this._client.expire(key, ttlSeconds);
    }
    return count;
  }

  async incrby(key: string, delta: number): Promise<number> {
    return this._client.incrby(key, delta);
  }

  async decrby(key: string, delta: number): Promise<number> {
    return this._client.decrby(key, delta);
  }

  async xadd(stream: string, data: Record<string, string>): Promise<string> {
    const args: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      args.push(k, v);
    }
    return this._client.xadd(stream, '*', ...args);
  }

  async xread(stream: string, fromId: string, count = 100): Promise<Array<{ id: string; data: Record<string, string> }>> {
    // XREAD COUNT n STREAMS stream fromId
    const raw: Array<[string, Array<[string, string[]]>]> | null =
      await this._client.xread('COUNT', count, 'STREAMS', stream, fromId);
    if (!raw) return [];
    const entries = raw[0]?.[1] ?? [];
    return entries.map(([id, fields]: [string, string[]]) => {
      const rec: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        rec[fields[i]] = fields[i + 1];
      }
      return { id, data: rec };
    });
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result: string | null = await this._client.set(key, '1', 'NX', 'EX', ttlSeconds);
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.del(key);
  }

  /** Gracefully disconnect (call on server shutdown). */
  async disconnect(): Promise<void> {
    await this._client.quit();
  }
}
