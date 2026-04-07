import type { IProbabilityProvider, BetRange } from '../domain/interfaces/IProbabilityProvider';
import type { Currency } from '../domain/interfaces/IWalletRepository';
import { BET_RANGE_CONFIG } from '../generated/BetRangeConfig.generated';

/**
 * Bet range provider — config sourced from Thunder_Config.xlsx via engine_generator.js.
 * DO NOT hardcode values here. Edit Thunder_Config.xlsx [幣種押注範圍] then run:
 *   node tools/slot-engine/build_config.js
 *   node tools/slot-engine/engine_generator.js
 */
export class BetRangeService implements IProbabilityProvider {
  async getBetRange(currency: Currency): Promise<BetRange> {
    const entry = BET_RANGE_CONFIG[currency];
    if (!entry) {
      throw new Error(`Unsupported currency: ${currency}`);
    }
    const { baseUnit, minLevel, maxLevel, stepLevel } = entry;
    const levels = Array.from(
      { length: Math.round((maxLevel - minLevel) / stepLevel) + 1 },
      (_, i) => minLevel + i * stepLevel,
    );
    return { currency, baseUnit, levels, minLevel, maxLevel };
  }
}
