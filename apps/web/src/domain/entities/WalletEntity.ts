import Decimal from 'decimal.js';
import { AppError } from '../../shared/errors/AppError';
import type { Wallet, Currency } from '../interfaces/IWalletRepository';

const DEPOSIT_LIMITS: Record<Currency, number> = { USD: 100_000, TWD: 3_000_000 };
const WITHDRAW_MINIMUMS: Record<Currency, number> = { USD: 1, TWD: 30 };

export class WalletEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly currency: Currency,
    private readonly _balance: Decimal,
    public readonly updatedAt: Date,
  ) {}

  get balance(): string {
    return this._balance.toFixed();
  }

  canDebit(amount: Decimal): boolean {
    return this._balance.gte(amount);
  }

  assertCanDebit(amount: Decimal): void {
    if (!this.canDebit(amount)) throw AppError.insufficientFunds();
  }

  assertDepositLimit(amount: Decimal): void {
    const limit = DEPOSIT_LIMITS[this.currency];
    if (amount.gt(limit)) {
      throw AppError.validation(`Deposit exceeds limit of ${limit} ${this.currency}`);
    }
  }

  assertWithdrawMin(amount: Decimal): void {
    const min = WITHDRAW_MINIMUMS[this.currency];
    if (amount.lt(min)) {
      throw AppError.validation(`Minimum withdrawal is ${min} ${this.currency}`);
    }
  }

  static fromRow(row: Wallet): WalletEntity {
    return new WalletEntity(row.id, row.userId, row.currency, new Decimal(row.balance), row.updatedAt);
  }
}
