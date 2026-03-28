import Decimal from 'decimal.js';
import type { IWalletRepository } from '../../domain/interfaces/IWalletRepository';
import { WalletEntity } from '../../domain/entities/WalletEntity';
import { AppError } from '../../shared/errors/AppError';

export interface DepositInput { userId: string; amount: string; provider?: string; nodeEnv: string }
export interface DepositOutput { balance: string; currency: string; deposited: string }

export class DepositUseCase {
  constructor(private walletRepo: IWalletRepository) {}

  async execute(input: DepositInput): Promise<DepositOutput> {
    // S-01: Block mock provider in production
    if (input.nodeEnv === 'production' && input.provider === 'mock') {
      throw AppError.providerForbidden();
    }

    const amountDecimal = new Decimal(input.amount);
    if (amountDecimal.lte(0) || !amountDecimal.isFinite()) {
      throw AppError.validation('Invalid deposit amount');
    }

    const row = await this.walletRepo.getByUserId(input.userId);
    if (!row) throw AppError.notFound('Wallet');

    const wallet = WalletEntity.fromRow(row);
    wallet.assertDepositLimit(amountDecimal);

    const updated = await this.walletRepo.credit(wallet.id, input.amount, 'deposit');
    return { balance: updated.balance, currency: updated.currency, deposited: input.amount };
  }
}
