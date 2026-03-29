import { BetRangeService } from '../../../src/services/BetRangeService';

describe('BetRangeService', () => {
  const service = new BetRangeService();

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
