/**
 * Shared engine adapter.
 * Bridges the Next.js API server to the Cocos game engine (SlotEngine.ts at repo root).
 * Dynamic require keeps Cocos-specific code out of the import graph at test time.
 */

export interface FullSpinOutcome {
  totalWin: number;
  grid: number[][];
  [key: string]: unknown;
}

export interface SpinOptions {
  mode: 'main' | 'extraBet' | 'buyFG';
  totalBet: number;
  extraBetOn?: boolean;
}

export interface ISlotEngine {
  computeFullSpin(opts: SpinOptions): FullSpinOutcome;
}

/**
 * Creates a SlotEngine instance using the Cocos game engine.
 * Path resolution: from this file (apps/web/src/shared/engine/), go up 5 levels to repo root,
 * then down into assets/scripts/SlotEngine.
 */
export function createSlotEngine(rng: { random(): number; randomInt(max: number): number }): ISlotEngine {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SlotEngine } = require('../../../../../assets/scripts/SlotEngine');
  // SlotEngine constructor expects a plain () => number function, not an object
  return new SlotEngine(() => rng.random());
}
