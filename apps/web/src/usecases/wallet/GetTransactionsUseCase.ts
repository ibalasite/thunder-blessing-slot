import type { IWalletRepository, WalletTransaction } from '../../domain/interfaces/IWalletRepository';
import { AppError } from '../../shared/errors/AppError';

export interface GetTransactionsInput { userId: string; limit: number; offset: number }
export interface GetTransactionsOutput { transactions: WalletTransaction[]; limit: number; offset: number }

export class GetTransactionsUseCase {
  constructor(private walletRepo: IWalletRepository) {}

  async execute(input: GetTransactionsInput): Promise<GetTransactionsOutput> {
    const row = await this.walletRepo.getByUserId(input.userId);
    if (!row) throw AppError.notFound('Wallet');
    const transactions = await this.walletRepo.getTransactions(row.id, input.limit, input.offset);
    return { transactions, limit: input.limit, offset: input.offset };
  }
}
