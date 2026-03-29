import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';

/**
 * No-op cache for local dev and integration tests.
 * All operations succeed silently with no side effects.
 */
export class NullCacheAdapter implements ICacheAdapter {
  private _store = new Map<string, { value: string; expiresAt?: number }>();
  private _streams = new Map<string, Array<{ id: string; data: Record<string, string> }>>();
  private _streamSeq = 0;

  async get(key: string): Promise<string | null> {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this._store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this._store.delete(key);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const current = await this.get(key);
    const next = (current ? parseInt(current, 10) : 0) + 1;
    await this.set(key, String(next), ttlSeconds);
    return next;
  }

  async incrby(key: string, delta: number): Promise<number> {
    const current = await this.get(key);
    const next = (current ? parseInt(current, 10) : 0) + delta;
    await this.set(key, String(next));
    return next;
  }

  async decrby(key: string, delta: number): Promise<number> {
    const current = await this.get(key);
    const next = (current ? parseInt(current, 10) : 0) - delta;
    await this.set(key, String(next));
    return next;
  }

  async xadd(stream: string, data: Record<string, string>): Promise<string> {
    const id = `${Date.now()}-${++this._streamSeq}`;
    const entries = this._streams.get(stream) ?? [];
    entries.push({ id, data });
    this._streams.set(stream, entries);
    return id;
  }

  async xread(stream: string, fromId: string, count = 100): Promise<Array<{ id: string; data: Record<string, string> }>> {
    const entries = this._streams.get(stream) ?? [];
    const filtered = fromId === '0'
      ? entries
      : entries.filter((e) => e.id > fromId);
    return filtered.slice(0, count);
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const existing = await this.get(key);
    if (existing !== null) return false;
    await this.set(key, '1', ttlSeconds);
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    await this.del(key);
  }
}
