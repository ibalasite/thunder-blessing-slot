import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { IWalletRepository, Wallet, WalletTransaction, TransactionType, Currency } from '../../interfaces/IWalletRepository';
import { AppError } from '../../shared/errors/AppError';

export class SupabaseWalletRepository implements IWalletRepository {
  private readonly _client: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this._client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async getByUserId(userId: string): Promise<Wallet | null> {
    const { data, error } = await this._client
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) return null;
    return this._mapWallet(data);
  }

  async createWallet(userId: string, currency: Currency): Promise<Wallet> {
    const { data, error } = await this._client
      .from('wallets')
      .insert({ user_id: userId, currency, balance: '0' })
      .select()
      .single();
    if (error) throw AppError.internal(`Failed to create wallet: ${error.message}`);
    return this._mapWallet(data);
  }

  async credit(walletId: string, amount: string, type: TransactionType, referenceId?: string): Promise<Wallet> {
    return this._transact(walletId, amount, type, 'credit', referenceId);
  }

  async debit(walletId: string, amount: string, type: TransactionType, referenceId?: string): Promise<Wallet> {
    return this._transact(walletId, amount, type, 'debit', referenceId);
  }

  private async _transact(
    walletId: string,
    amount: string,
    type: TransactionType,
    direction: 'credit' | 'debit',
    referenceId?: string,
  ): Promise<Wallet> {
    const { data, error } = await this._client.rpc('wallet_transact', {
      p_wallet_id: walletId,
      p_amount: amount,
      p_type: type,
      p_direction: direction,
      p_reference_id: referenceId ?? null,
    });
    if (error) {
      if (error.message.includes('insufficient')) throw AppError.insufficientFunds();
      throw AppError.internal(`Wallet transaction failed: ${error.message}`);
    }
    return this._mapWallet(data);
  }

  async getTransactions(walletId: string, limit: number, offset: number): Promise<WalletTransaction[]> {
    const { data, error } = await this._client
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw AppError.internal(`Failed to get transactions: ${error.message}`);
    return (data ?? []).map(this._mapTransaction);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mapWallet(row: any): Wallet {
    return {
      id: row.id,
      userId: row.user_id,
      currency: row.currency,
      balance: row.balance,
      updatedAt: new Date(row.updated_at),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mapTransaction(row: any): WalletTransaction {
    return {
      id: row.id,
      walletId: row.wallet_id,
      type: row.type,
      amount: row.amount,
      balanceBefore: row.balance_before,
      balanceAfter: row.balance_after,
      referenceId: row.reference_id,
      createdAt: new Date(row.created_at),
    };
  }
}
