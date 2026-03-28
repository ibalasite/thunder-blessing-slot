export type Currency = 'USD' | 'TWD';

export interface Wallet {
  id: string;
  userId: string;
  currency: Currency;
  balance: string;  // Decimal string to avoid float precision issues
  updatedAt: Date;
}

export type TransactionType = 'deposit' | 'withdraw' | 'bet' | 'win' | 'withdrawal';

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceId: string | null;
  createdAt: Date;
}

export interface IWalletRepository {
  getByUserId(userId: string): Promise<Wallet | null>;
  credit(walletId: string, amount: string, type: TransactionType, referenceId?: string): Promise<Wallet>;
  debit(walletId: string, amount: string, type: TransactionType, referenceId?: string): Promise<Wallet>;
  getTransactions(walletId: string, limit: number, offset: number): Promise<WalletTransaction[]>;
  createWallet(userId: string, currency: Currency): Promise<Wallet>;
}
