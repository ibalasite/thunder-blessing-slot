import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ISpinLogRepository, SpinLog } from '../../domain/interfaces/ISpinLogRepository';
import { AppError } from '../../shared/errors/AppError';

export class SupabaseSpinLogRepository implements ISpinLogRepository {
  private readonly _client: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this._client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async create(log: Omit<SpinLog, 'createdAt'>): Promise<SpinLog> {
    const { data, error } = await this._client
      .from('spin_logs')
      .insert({
        spin_id: log.id,
        user_id: log.userId,
        session_id: log.sessionId,
        mode: log.mode,
        currency: log.currency,
        bet_level: log.betLevel,
        win_level: log.winLevel,
        base_unit: log.baseUnit,
        player_bet: log.playerBet,
        player_win: log.playerWin,
        grid_snapshot: log.gridSnapshot,
        rng_bytes: log.rngBytes,
        rng_byte_count: log.rngByteCount,
        server_seed: log.serverSeed,
        client_seed: log.clientSeed,
      })
      .select()
      .single();
    if (error) throw AppError.internal(`Failed to create spin log: ${error.message}`);
    return this._mapLog(data);
  }

  async getById(id: string): Promise<SpinLog | null> {
    const { data, error } = await this._client
      .from('spin_logs')
      .select('*')
      .eq('spin_id', id)
      .single();
    if (error) return null;
    return this._mapLog(data);
  }

  async getByUser(userId: string, limit: number, offset: number): Promise<SpinLog[]> {
    const { data, error } = await this._client
      .from('spin_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw AppError.internal(`Failed to get spin logs: ${error.message}`);
    return (data ?? []).map(this._mapLog);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mapLog(row: any): SpinLog {
    return {
      id: row.spin_id,
      userId: row.user_id,
      sessionId: row.session_id,
      mode: row.mode,
      currency: row.currency,
      betLevel: row.bet_level,
      winLevel: row.win_level,
      baseUnit: row.base_unit,
      playerBet: row.player_bet,
      playerWin: row.player_win,
      gridSnapshot: row.grid_snapshot,
      rngBytes: row.rng_bytes ? Buffer.from(row.rng_bytes) : null,
      rngByteCount: row.rng_byte_count,
      serverSeed: row.server_seed,
      clientSeed: row.client_seed,
      createdAt: new Date(row.created_at),
    };
  }
}
