import type { Currency } from './IWalletRepository';

export interface SpinLog {
  id: string;
  userId: string;
  sessionId: string;
  mode: string;
  currency: Currency;
  betLevel: number;
  winLevel: number;
  baseUnit: string;
  playerBet: string;
  playerWin: string;
  gridSnapshot: unknown;
  rngBytes: Buffer | null;
  rngByteCount: number;
  serverSeed: string;
  clientSeed: string | null;
  createdAt: Date;
}

export interface ISpinLogRepository {
  create(log: Omit<SpinLog, 'id' | 'createdAt'>): Promise<SpinLog>;
  getById(id: string): Promise<SpinLog | null>;
  getByUser(userId: string, limit: number, offset: number): Promise<SpinLog[]>;
}
