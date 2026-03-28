/**
 * LocalWalletService — 單機版錢包
 *
 * Phase 1 實作：所有操作同步，餘額存在記憶體。
 * 未來 RemoteWalletService 會改為非同步呼叫 server API。
 */
import type { IWalletService, SpinTx } from '../contracts/IWalletService';
import { InsufficientFundsError } from '../contracts/IAccountService';
import { DEFAULT_BALANCE } from '../GameConfig';
import { addMoney, subtractMoney } from '../core/money';

export class LocalWalletService implements IWalletService {
    private _balance: number;
    private _pendingTx: SpinTx | null = null;
    private _txCounter = 0;

    constructor(initialBalance: number = DEFAULT_BALANCE) {
        this._balance = initialBalance;
    }

    getBalance(): number {
        return this._balance;
    }

    canAfford(amount: number): boolean {
        return this._balance >= amount;
    }

    beginSpin(wagered: number): SpinTx {
        if (!this.canAfford(wagered)) {
            throw new InsufficientFundsError(this._balance, wagered);
        }
        this._balance = subtractMoney(this._balance, wagered);
        const tx: SpinTx = {
            txId:      `local-${++this._txCounter}`,
            wagered,
            timestamp: Date.now(),
        };
        this._pendingTx = tx;
        return tx;
    }

    completeSpin(tx: SpinTx, totalWin: number): number {
        if (this._pendingTx?.txId !== tx.txId) {
            throw new Error(`Invalid SpinTx: expected ${this._pendingTx?.txId}, got ${tx.txId}`);
        }
        this._balance = addMoney(this._balance, totalWin);
        this._pendingTx = null;
        return this._balance;
    }

    getPendingTx(): SpinTx | null {
        return this._pendingTx;
    }

    // ── 向後相容 ──────────────────────────────────────
    debit(amount: number): void {
        if (!this.canAfford(amount)) {
            throw new InsufficientFundsError(this._balance, amount);
        }
        this._balance = subtractMoney(this._balance, amount);
    }

    credit(amount: number): void {
        this._balance = addMoney(this._balance, amount);
    }
}
