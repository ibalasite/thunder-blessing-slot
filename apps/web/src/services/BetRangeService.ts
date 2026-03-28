import type { ICacheAdapter } from '../domain/interfaces/ICacheAdapter';
import type { IProbabilityProvider, BetRange } from '../domain/interfaces/IProbabilityProvider';
import type { Currency } from '../domain/interfaces/IWalletRepository';

const CACHE_TTL_SECONDS = 3600; // 1 hour

const BET_RANGES: Record<Currency, BetRange> = {
  USD: {
    currency: 'USD',
    baseUnit: '0.01',         // 1 cent per level
    levels: [1, 5, 10, 25, 50, 100, 200, 500, 1000],
    minLevel: 1,
    maxLevel: 1000,
  },
  TWD: {
    currency: 'TWD',
    baseUnit: '1',            // 1 TWD per level
    levels: [1, 5, 10, 25, 50, 100, 200, 500, 1000],
    minLevel: 1,
    maxLevel: 1000,
  },
};

/**
 * Cache-first bet range provider.
 * Cache key: bet-range:{currency}  TTL: 1h
 * Falls back to hardcoded config if cache is unavailable.
 */
export class BetRangeService implements IProbabilityProvider {
  constructor(private readonly cache: ICacheAdapter) {}

  async getBetRange(currency: Currency): Promise<BetRange> {
    const cacheKey = `bet-range:${currency}`;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as BetRange;
    }

    const range = BET_RANGES[currency];
    if (!range) {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    await this.cache.set(cacheKey, JSON.stringify(range), CACHE_TTL_SECONDS);
    return range;
  }
}
