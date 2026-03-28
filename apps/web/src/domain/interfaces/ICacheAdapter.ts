export interface ICacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Increment a counter; returns new value. Creates key if absent. */
  incr(key: string, ttlSeconds?: number): Promise<number>;
  /** Acquire a distributed lock; returns true if acquired. */
  acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
}
