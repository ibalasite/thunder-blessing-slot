import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';

/**
 * Upstash Redis adapter (REST API, no persistent connection needed).
 * Uses fetch — compatible with Edge runtime and serverless.
 */
export class UpstashCacheAdapter implements ICacheAdapter {
  private readonly _url: string;
  private readonly _token: string;

  constructor(url: string, token: string) {
    if (!url || !token) {
      throw new Error('UpstashCacheAdapter: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required');
    }
    this._url = url;
    this._token = token;
  }

  private async _cmd<T>(args: unknown[]): Promise<T> {
    const res = await fetch(this._url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this._token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      throw new Error(`Upstash error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { result: T };
    return data.result;
  }

  async get(key: string): Promise<string | null> {
    return this._cmd<string | null>(['GET', key]);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const args: unknown[] = ['SET', key, value];
    if (ttlSeconds) args.push('EX', ttlSeconds);
    await this._cmd<string>(args);
  }

  async del(key: string): Promise<void> {
    await this._cmd<number>(['DEL', key]);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const count = await this._cmd<number>(['INCR', key]);
    if (ttlSeconds && count === 1) {
      // Only set TTL on first increment (so we don't reset window)
      await this._cmd<string>(['EXPIRE', key, ttlSeconds]);
    }
    return count;
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    // SET NX EX — atomic
    const result = await this._cmd<string | null>(['SET', key, '1', 'NX', 'EX', ttlSeconds]);
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.del(key);
  }
}
