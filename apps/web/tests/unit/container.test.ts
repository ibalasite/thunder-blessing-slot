import { container } from '../../src/container';
import { NullCacheAdapter } from '../../src/adapters/cache/NullCacheAdapter';
import { CryptoRNGProvider } from '../../src/rng/CryptoRNGProvider';
import type { ICacheAdapter } from '../../src/interfaces/ICacheAdapter';
import type { IRNGProvider } from '../../src/interfaces/IRNGProvider';

afterEach(() => container._reset());

describe('container._override() + _reset()', () => {
  it('overrides cache with custom adapter', () => {
    const customCache = new NullCacheAdapter();
    container._override({ cache: customCache });
    expect(container.cache).toBe(customCache);
  });

  it('overrides rng provider', () => {
    const customRng = new CryptoRNGProvider();
    container._override({ rng: customRng });
    expect(container.rng).toBe(customRng);
  });

  it('_reset() clears overrides (cache rebuilds via buildCache)', () => {
    const customCache: ICacheAdapter = {
      get: jest.fn(), set: jest.fn(), del: jest.fn(),
      incr: jest.fn(), acquireLock: jest.fn(), releaseLock: jest.fn(),
    };
    container._override({ cache: customCache });
    container._reset();
    // After reset, accessing cache should create a new NullCacheAdapter
    // (no UPSTASH env vars set in test)
    expect(container.cache).not.toBe(customCache);
    expect(container.cache).toBeInstanceOf(NullCacheAdapter);
  });

  it('_reset() allows re-override', () => {
    const rng1 = new CryptoRNGProvider();
    container._override({ rng: rng1 });
    container._reset();
    const rng2 = new CryptoRNGProvider();
    container._override({ rng: rng2 });
    expect(container.rng).toBe(rng2);
  });

  it('container.cache uses NullCacheAdapter when UPSTASH env absent', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(container.cache).toBeInstanceOf(NullCacheAdapter);
  });

  it('container.rng returns CryptoRNGProvider by default', () => {
    expect(container.rng).toBeInstanceOf(CryptoRNGProvider);
  });

  it('container.cache uses UpstashCacheAdapter when UPSTASH env vars set', () => {
    container._reset();
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    const { UpstashCacheAdapter } = require('../../src/adapters/cache/UpstashCacheAdapter');
    expect(container.cache).toBeInstanceOf(UpstashCacheAdapter);
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('container.probabilityProvider lazy-loads BetRangeService', () => {
    container._reset();
    const pp = container.probabilityProvider;
    expect(pp).toBeDefined();
    expect(typeof pp.getBetRange).toBe('function');
    // Second access returns same instance (singleton)
    expect(container.probabilityProvider).toBe(pp);
  });
});
