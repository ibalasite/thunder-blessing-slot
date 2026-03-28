/**
 * RemoteWalletService.ts
 * IWalletService implementation for server mode (Phase 2)
 *
 * In server mode, debit + credit happen atomically inside the API spin call.
 * beginSpin() creates a local tx record (no API call needed — server handles debit).
 * completeSpin() returns the balance already updated by RemoteEngineAdapter.
 */
import { IWalletService, SpinTx } from '../contracts/IWalletService';
import { RemoteApiClient } from './RemoteApiClient';

export class RemoteWalletService implements IWalletService {
  private _txCounter = 0;

  constructor(private readonly _client: RemoteApiClient) {}

  getBalance(): number {
    return this._client.balance;
  }

  canAfford(amount: number): boolean {
    return this._client.balance >= amount;
  }

  /** Creates a local tx token. Actual debit happens on the server during spin. */
  beginSpin(wagered: number): SpinTx {
    return {
      txId: `remote-${++this._txCounter}`,
      wagered,
      timestamp: Date.now(),
    };
  }

  /** Balance was already updated by RemoteEngineAdapter. Returns current balance. */
  completeSpin(_tx: SpinTx, _totalWin: number): number {
    return this._client.balance;
  }

  getPendingTx(): SpinTx | null {
    return null; // Server handles pending state
  }

  /** @deprecated Use beginSpin/completeSpin */
  debit(_amount: number): void {
    // No-op: server handles debit
  }

  /** @deprecated Use completeSpin */
  credit(_amount: number): void {
    // No-op: server handles credit
  }
}
