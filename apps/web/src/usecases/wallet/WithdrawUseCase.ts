import Decimal from 'decimal.js';
import type { IWalletRepository } from '../../domain/interfaces/IWalletRepository';
import { WalletEntity } from '../../domain/entities/WalletEntity';
import { AppError } from '../../shared/errors/AppError';

export interface WithdrawInput { userId: string; amount: string }
export interface WithdrawOutput { balance: string; currency: string; withdrawn: string }

export class WithdrawUseCase {
  constructor(private walletRepo: IWalletRepository) {}

  async execute(input: WithdrawInput): Promise<WithdrawOutput> {
    const amountDecimal = new Decimal(input.amount);
    if (!amountDecimal.isFinite() || amountDecimal.lte(0)) {
      throw AppError.validation('Invalid withdrawal amount');
    }

    const row = await this.walletRepo.getByUserId(input.userId);
    if (!row) throw AppError.notFound('Wallet');

    const wallet = WalletEntity.fromRow(row);
    wallet.assertWithdrawMin(amountDecimal);

    const updated = await this.walletRepo.debit(wallet.id, input.amount, 'withdrawal');
    return { balance: updated.balance, currency: updated.currency, withdrawn: input.amount };
  }
}
