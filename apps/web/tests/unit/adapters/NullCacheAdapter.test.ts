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

  describe('incrby / decrby', () => {
    it('incrby starts at delta for new key', async () => {
      expect(await cache.incrby('k', 10)).toBe(10);
    });

    it('incrby accumulates', async () => {
      await cache.incrby('k', 5);
      expect(await cache.incrby('k', 3)).toBe(8);
    });

    it('decrby starts at -delta for new key', async () => {
      expect(await cache.decrby('k', 5)).toBe(-5);
    });

    it('decrby reduces existing value', async () => {
      await cache.incrby('k', 100);
      expect(await cache.decrby('k', 40)).toBe(60);
    });
  });

  describe('xadd / xread', () => {
    it('xadd returns an entry ID', async () => {
      const id = await cache.xadd('stream', { foo: 'bar' });
      expect(typeof id).toBe('string');
    });

    it('xread returns entries added after fromId "0"', async () => {
      await cache.xadd('s', { a: '1' });
      await cache.xadd('s', { b: '2' });
      const entries = await cache.xread('s', '0');
      expect(entries).toHaveLength(2);
      expect(entries[0].data['a']).toBe('1');
      expect(entries[1].data['b']).toBe('2');
    });

    it('xread filters entries after cursor', async () => {
      const id1 = await cache.xadd('s', { x: '1' });
      await cache.xadd('s', { y: '2' });
      const entries = await cache.xread('s', id1);
      expect(entries).toHaveLength(1);
      expect(entries[0].data['y']).toBe('2');
    });

    it('xread on empty stream returns []', async () => {
      expect(await cache.xread('empty', '0')).toEqual([]);
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
