import type { IProbabilityCore, SpinParams, SpinOutcome } from '../../domain/interfaces/IProbabilityCore';
import type { IRNGProvider } from '../../domain/interfaces/IRNGProvider';

/**
 * Bridges the Cocos/shared SlotEngine to the IProbabilityCore contract.
 * Swap this for any future game engine without touching GameRunner.
 */
export class SlotEngineProbabilityCore implements IProbabilityCore {
  constructor(private rng: IRNGProvider) {}

  computeSpin(params: SpinParams): SpinOutcome {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSlotEngine } = require('../../shared/engine/slotEngine');
    const engine = createSlotEngine(this.rng);
    return engine.computeFullSpin({
      mode: params.mode,
      totalBet: params.totalBet,
      extraBetOn: params.extraBetOn,
    }) as SpinOutcome;
  }

  getSpinBytes(): Buffer[] {
    return this.rng.getSpinBytes();
  }

  resetSpinBytes(): void {
    this.rng.resetSpinBytes();
  }
}
