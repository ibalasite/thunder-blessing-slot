/**
 * LocalAccountService.ts
 * 本地帳戶服務（單機版），實作 IAccountService
 * 純 TypeScript，無 Cocos 依賴，可直接在 Node.js 測試
 */
import { IAccountService, InsufficientFundsError } from '../contracts/IAccountService';
import { DEFAULT_BALANCE } from '../GameConfig';

export class LocalAccountService implements IAccountService {
    private _balance: number;

    constructor(initialBalance: number = DEFAULT_BALANCE) {
        this._balance = initialBalance;
    }

    getBalance(): number {
        return this._balance;
    }

    canAfford(amount: number): boolean {
        return this._balance >= amount;
    }

    debit(amount: number): void {
        if (!this.canAfford(amount)) {
            throw new InsufficientFundsError(this._balance, amount);
        }
        this._balance = parseFloat((this._balance - amount).toFixed(4));
    }

    credit(amount: number): void {
        this._balance = parseFloat((this._balance + amount).toFixed(4));
    }
}
