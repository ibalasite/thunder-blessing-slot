/**
 * IAccountService
 * 帳號餘額合約 — 單機版由 LocalAccountService 實作，Server 版由 RemoteAccountService 實作
 */
export interface IAccountService {
    getBalance(): number;
    canAfford(amount: number): boolean;
    /** 扣款（押注）；若餘額不足應拋出 InsufficientFundsError */
    debit(amount: number): void;
    /** 加款（獎金） */
    credit(amount: number): void;
}

export class InsufficientFundsError extends Error {
    constructor(balance: number, amount: number) {
        super(`Insufficient funds: balance=${balance}, required=${amount}`);
        this.name = 'InsufficientFundsError';
    }
}
