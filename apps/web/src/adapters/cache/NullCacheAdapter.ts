import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';

/**
 * No-op cache for local dev and integration tests.
 * All operations succeed silently with no side effects.
 */
export class NullCacheAdapter implements ICacheAdapter {
  private _store = new Map<string, { value: string; expiresAt?: number }>();

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
