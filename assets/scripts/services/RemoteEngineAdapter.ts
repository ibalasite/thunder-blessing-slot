/**
 * RemoteEngineAdapter.ts
 * IEngineAdapter implementation — calls the Thunder Blessing API for spin resolution
 * Server handles debit + engine + credit atomically (Phase 2 server mode)
 */
import { IEngineAdapter } from '../contracts/IEngineAdapter';
import { SpinRequest, SpinResponse, GameMode, FullSpinOutcome, FGSpinOutcome, CascadeStep } from '../contracts/types';
import { RemoteApiClient } from './RemoteApiClient';

export class RemoteEngineAdapter implements IEngineAdapter {
  constructor(private readonly _client: RemoteApiClient) {}

  /** Not used in Phase 2 (fullSpin is the primary path). Legacy shim. */
  async spin(_req: SpinRequest): Promise<SpinResponse> {
    throw new Error('RemoteEngineAdapter: legacy spin() not supported. Use fullSpin().');
  }

  async fullSpin(mode: GameMode, totalBet: number, extraBetOn?: boolean): Promise<FullSpinOutcome> {
    // Convert totalBet (decimal currency) → betLevel (integer) using baseUnit from API
    const betLevel = Math.round(totalBet / this._client.baseUnit);

    const result = await this._client.spin({
      mode,
      betLevel,
      currency: this._client.currency,
      extraBetOn: extraBetOn ?? false,
    });

    // Server engine receives betLevel (e.g. 25) as totalBet and produces all win values
    // in betLevel units (e.g. totalWin=3000). Scale every monetary field back to
    // currency units (×baseUnit = 0.01) so the controller and UI always see USD amounts.
    return this._scaleOutcome(result.outcome as FullSpinOutcome);
  }

  /**
   * Convert all monetary fields in a FullSpinOutcome from betLevel units back to
   * currency units by multiplying by baseUnit.
   *
   * Non-monetary fields (grid, symbols, multiplier indices, spinBonus, booleans,
   * probability, TBStep cell lists) are left unchanged.
   */
  private _scaleOutcome(raw: FullSpinOutcome): FullSpinOutcome {
    const s = this._client.baseUnit;

    const scaleStep = (step: CascadeStep): CascadeStep => ({
      ...step,
      rawWin: step.rawWin * s,
    });

    const scaleSpin = (spin: SpinResponse): SpinResponse => ({
      ...spin,
      totalWin:     spin.totalWin * s,
      cascadeSteps: spin.cascadeSteps.map(scaleStep),
    });

    const scaleFGSpin = (fg: FGSpinOutcome): FGSpinOutcome => ({
      ...fg,
      rawWin:        fg.rawWin * s,
      multipliedWin: fg.multipliedWin * s,
      spin:          scaleSpin(fg.spin),
      // spinBonus is a plain multiplier (1/5/20/100), not a monetary value — no scaling
    });

    return {
      ...raw,
      totalBet:    raw.totalBet    * s,
      wagered:     raw.wagered     * s,
      baseWin:     raw.baseWin     * s,
      fgWin:       raw.fgWin       * s,
      totalRawWin: raw.totalRawWin * s,
      totalWin:    raw.totalWin    * s,
      baseSpins:   raw.baseSpins.map(scaleSpin),
      fgSpins:     raw.fgSpins.map(scaleFGSpin),
    };
  }
}
