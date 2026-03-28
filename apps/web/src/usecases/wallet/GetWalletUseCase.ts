import type { IWalletRepository } from '../../domain/interfaces/IWalletRepository';
import { WalletEntity } from '../../domain/entities/WalletEntity';
import { AppError } from '../../shared/errors/AppError';

export interface GetWalletInput { userId: string }
export interface GetWalletOutput { id: string; currency: string; balance: string }

export class GetWalletUseCase {
  constructor(private walletRepo: IWalletRepository) {}

  async execute(input: GetWalletInput): Promise<GetWalletOutput> {
    const row = await this.walletRepo.getByUserId(input.userId);
    if (!row) throw AppError.notFound('Wallet');
    const wallet = WalletEntity.fromRow(row);
    return { id: wallet.id, currency: wallet.currency, balance: wallet.balance };
  }
}
