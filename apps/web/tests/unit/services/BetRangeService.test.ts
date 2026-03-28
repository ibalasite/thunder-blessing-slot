import { BetRangeService } from '../../../src/services/BetRangeService';
import { NullCacheAdapter } from '../../../src/adapters/cache/NullCacheAdapter';

describe('BetRangeService', () => {
  let cache: NullCacheAdapter;
  let service: BetRangeService;

  beforeEach(() => {
    cache = new NullCacheAdapter();
    service = new BetRangeService(cache);
  });

  it('returns USD bet range', async () => {
    const range = await service.getBetRange('USD');
    expect(range.currency).toBe('USD');
    expect(range.baseUnit).toBe('0.01');
    expect(range.levels.length).toBeGreaterThan(0);
    expect(range.minLevel).toBeLessThanOrEqual(range.maxLevel);
  });

  it('returns TWD bet range', async () => {
    const range = await service.getBetRange('TWD');
    expect(range.currency).toBe('TWD');
    expect(range.baseUnit).toBe('1');
  });

  it('caches result on second call', async () => {
    const getSpy = jest.spyOn(cache, 'get');
    await service.getBetRange('USD');
    await service.getBetRange('USD');
    // Second call should hit cache
    expect(getSpy).toHaveBeenCalledTimes(2);
    const setSpy = jest.spyOn(cache, 'set');
    await service.getBetRange('USD'); // cache hit, no set
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('throws for unsupported currency', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(service.getBetRange('EUR' as any)).rejects.toThrow('Unsupported currency');
  });

  it('all levels are within min/max bounds', async () => {
    for (const currency of ['USD', 'TWD'] as const) {
      const range = await service.getBetRange(currency);
      for (const level of range.levels) {
        expect(level).toBeGreaterThanOrEqual(range.minLevel);
        expect(level).toBeLessThanOrEqual(range.maxLevel);
      }
    }
  });
});
