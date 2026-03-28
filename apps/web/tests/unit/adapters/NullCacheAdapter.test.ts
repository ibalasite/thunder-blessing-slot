import { NullCacheAdapter } from '../../../src/adapters/cache/NullCacheAdapter';

describe('NullCacheAdapter', () => {
  let cache: NullCacheAdapter;

  beforeEach(() => {
    cache = new NullCacheAdapter();
  });

  describe('get / set', () => {
    it('returns null for missing key', async () => {
      expect(await cache.get('missing')).toBeNull();
    });

    it('stores and retrieves a value', async () => {
      await cache.set('k', 'v');
      expect(await cache.get('k')).toBe('v');
    });

    it('expires entries after TTL', async () => {
      await cache.set('k', 'v', 0.001); // 1ms TTL
      await new Promise((r) => setTimeout(r, 5));
      expect(await cache.get('k')).toBeNull();
    });

    it('never expires when no TTL given', async () => {
      await cache.set('k', 'v');
      // Immediately after — should still be present
      expect(await cache.get('k')).toBe('v');
    });
  });

  describe('del', () => {
    it('removes an existing key', async () => {
      await cache.set('k', 'v');
      await cache.del('k');
      expect(await cache.get('k')).toBeNull();
    });

    it('no-op for missing key', async () => {
      await expect(cache.del('missing')).resolves.toBeUndefined();
    });
  });

  describe('incr', () => {
    it('starts at 1 for new key', async () => {
      expect(await cache.incr('counter')).toBe(1);
    });

    it('increments existing key', async () => {
      await cache.incr('counter');
      await cache.incr('counter');
      expect(await cache.incr('counter')).toBe(3);
    });
  });

  describe('acquireLock / releaseLock', () => {
    it('acquires lock when key absent', async () => {
      expect(await cache.acquireLock('lock', 10)).toBe(true);
    });

    it('fails to acquire when lock held', async () => {
      await cache.acquireLock('lock', 10);
      expect(await cache.acquireLock('lock', 10)).toBe(false);
    });

    it('re-acquirable after release', async () => {
      await cache.acquireLock('lock', 10);
      await cache.releaseLock('lock');
      expect(await cache.acquireLock('lock', 10)).toBe(true);
    });
  });
});
