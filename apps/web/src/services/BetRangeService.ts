import type { ICacheAdapter } from '../domain/interfaces/ICacheAdapter';
import type { IProbabilityProvider, BetRange } from '../domain/interfaces/IProbabilityProvider';
import type { Currency } from '../domain/interfaces/IWalletRepository';

const CACHE_TTL_SECONDS = 3600; // 1 hour

// Cocos game uses totalBet [0.25..10.00] in steps of 0.25 with LINES_BASE=25.
// betLevel = totalBet / baseUnit → multiples of 25 from 25 to 1000.
// All 40 levels must be explicitly allowed for the validation check.
const USD_LEVELS = Array.from({ length: 40 }, (_, i) => (i + 1) * 25);

const BET_RANGES: Record<Currency, BetRange> = {
  USD: {
    currency: 'USD',
    baseUnit: '0.01',         // 1 cent per level; totalBet = betLevel × 0.01
    levels: USD_LEVELS,       // [25, 50, 75, ..., 1000] → $0.25 to $10.00
    minLevel: 25,
    maxLevel: 1000,
  },
  TWD: {
    currency: 'TWD',
    baseUnit: '1',            // 1 TWD per level
    levels: USD_LEVELS,       // same integer steps, same validation logic
    minLevel: 25,
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
