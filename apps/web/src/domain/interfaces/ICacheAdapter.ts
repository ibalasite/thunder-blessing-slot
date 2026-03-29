export interface ICacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Increment by 1; returns new value. Creates key (=0) if absent. */
  incr(key: string, ttlSeconds?: number): Promise<number>;
  /** Increment by delta; returns new value. Creates key (=0) if absent. */
  incrby(key: string, delta: number): Promise<number>;
  /** Decrement by delta; returns new value. Creates key (=0) if absent. */
  decrby(key: string, delta: number): Promise<number>;
  /** Append an entry to a Redis Stream; returns the assigned entry ID. */
  xadd(stream: string, data: Record<string, string>): Promise<string>;
  /** Read entries from a Redis Stream starting after fromId ('0' = from beginning). */
  xread(stream: string, fromId: string, count?: number): Promise<Array<{ id: string; data: Record<string, string> }>>;
  /** Acquire a distributed lock; returns true if acquired. */
  acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
}
