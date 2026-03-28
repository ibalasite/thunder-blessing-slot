/**
 * RemoteEngineAdapter.ts
 * IEngineAdapter implementation — calls the Thunder Blessing API for spin resolution
 * Server handles debit + engine + credit atomically (Phase 2 server mode)
 */
import { IEngineAdapter } from '../contracts/IEngineAdapter';
import { SpinRequest, SpinResponse, GameMode, FullSpinOutcome } from '../contracts/types';
import { RemoteApiClient } from './RemoteApiClient';

export class RemoteEngineAdapter implements IEngineAdapter {
  constructor(private readonly _client: RemoteApiClient) {}

  /** Not used in Phase 2 (fullSpin is the primary path). Legacy shim. */
  async spin(_req: SpinRequest): Promise<SpinResponse> {
    throw new Error('RemoteEngineAdapter: legacy spin() not supported. Use fullSpin().');
  }

  async fullSpin(mode: GameMode, totalBet: number, extraBetOn?: boolean): Promise<FullSpinOutcome> {
    // Convert totalBet (decimal amount) → betLevel (integer) using baseUnit from API
    const betLevel = Math.round(totalBet / this._client.baseUnit);

    const result = await this._client.spin({
      mode,
      betLevel,
      currency: this._client.currency,
      extraBetOn: extraBetOn ?? false,
    });

    return result.outcome as FullSpinOutcome;
  }
}
