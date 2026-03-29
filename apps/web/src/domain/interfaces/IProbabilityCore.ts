import type { SpinMode } from '../../usecases/game/SpinUseCase';

export interface SpinParams {
  mode: SpinMode;
  totalBet: number;
  extraBetOn: boolean;
}

export interface SpinOutcome {
  totalWin: number;
  [key: string]: unknown;
}

/**
 * IProbabilityCore — the game engine contract.
 *
 * Swap this implementation to change the underlying game logic
 * without modifying GameRunner or any middleware layer.
 */
export interface IProbabilityCore {
  /** Execute a spin and return the outcome. */
  computeSpin(params: SpinParams): SpinOutcome;
  /** Return all RNG bytes consumed during the last spin (for audit trail). */
  getSpinBytes(): Buffer[];
  /** Clear the accumulated spin bytes before each spin. */
  resetSpinBytes(): void;
}
