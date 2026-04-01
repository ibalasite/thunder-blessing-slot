/**
 * reconcileWallets (2A-21)
 *
 * Compares wallet balances between Redis and Supabase DB.
 * - WALLET_PROVIDER=redis: checks every cached wallet for Redis↔DB drift
 * - WALLET_PROVIDER=supabase: sanity-checks all DB wallets (non-negative balance)
 *
 * Logs discrepancies — does NOT auto-correct.
 * Returns { checked, discrepancies } — exit code 1 when discrepancies > 0.
 */

import { createClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';

const CENTS_SCALE = 10000;
const TOLERANCE = new Decimal('0.0001'); // 4-decimal precision

export interface ReconcileResult {
  checked: number;
  discrepancies: number;
  errors: number;
}

export async function reconcileWallets(): Promise<ReconcileResult> {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const walletProvider = process.env.WALLET_PROVIDER ?? 'supabase';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let checked = 0;
  let discrepancies = 0;
  let errors = 0;

  if (walletProvider === 'redis') {
    await reconcileRedisVsDB(client, { checked, discrepancies, errors });
  } else {
    const result = await reconcileDB(client);
    checked = result.checked;
    discrepancies = result.discrepancies;
    errors = result.errors;
  }

  return { checked, discrepancies, errors };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reconcileDB(client: any): Promise<ReconcileResult> {
  let checked = 0;
  let discrepancies = 0;
  let errors = 0;

  // Fetch all wallets
  const { data: wallets, error } = await client
    .from('wallets')
    .select('id, user_id, balance, currency');

  if (error) {
    console.error('[reconcile] Failed to fetch wallets from DB:', error.message);
    return { checked: 0, discrepancies: 0, errors: 1 };
  }

  for (const wallet of wallets ?? []) {
    checked++;
    try {
      const balance = new Decimal(wallet.balance);

      // Sanity: balance must be non-negative
      if (balance.isNegative()) {
        console.error(
          `[reconcile] DISCREPANCY wallet=${wallet.id} user=${wallet.user_id} ` +
          `balance=${wallet.balance} is NEGATIVE`,
        );
        discrepancies++;
        continue;
      }

      // Cross-check: sum of credits - sum of debits should equal balance
      const { data: txSums, error: txErr } = await client
        .from('wallet_transactions')
        .select('type, amount')
        .eq('wallet_id', wallet.id);

      if (txErr) {
        console.error(`[reconcile] Failed to fetch transactions for wallet=${wallet.id}:`, txErr.message);
        errors++;
        continue;
      }

      if (!txSums || txSums.length === 0) continue;

      let credits = new Decimal(0);
      let debits = new Decimal(0);
      for (const tx of txSums) {
        const amt = new Decimal(tx.amount);
        const creditTypes = ['deposit', 'spin_credit', 'credit', 'win', 'bonus', 'adjustment'];
        const debitTypes = ['withdraw', 'spin_debit', 'debit', 'bet'];
        if (creditTypes.includes(tx.type)) credits = credits.plus(amt);
        else if (debitTypes.includes(tx.type)) debits = debits.plus(amt);
      }

      // Initial balance from DB trigger = 1000 USD
      const expected = new Decimal('1000').plus(credits).minus(debits);
      const diff = balance.minus(expected).abs();

      if (diff.greaterThan(TOLERANCE)) {
        console.error(
          `[reconcile] DISCREPANCY wallet=${wallet.id} user=${wallet.user_id} ` +
          `db=${wallet.balance} expected=${expected.toFixed(4)} diff=${diff.toFixed(4)}`,
        );
        discrepancies++;
      }
    } catch (e) {
      console.error(`[reconcile] Error processing wallet=${wallet.id}:`, e);
      errors++;
    }
  }

  console.log(`[reconcile] DB check complete: checked=${checked} discrepancies=${discrepancies} errors=${errors}`);
  return { checked, discrepancies, errors };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reconcileRedisVsDB(client: any, result: ReconcileResult): Promise<ReconcileResult> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('[reconcile] WALLET_PROVIDER=redis but REDIS_URL is not set');
    result.errors++;
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = require('ioredis');
  const redis = new Redis(redisUrl);

  try {
    // Scan all wallet:balance:* keys in Redis
    const balanceKeys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'wallet:balance:*', 'COUNT', 100);
      cursor = nextCursor;
      balanceKeys.push(...keys);
    } while (cursor !== '0');

    for (const key of balanceKeys) {
      const walletId = key.replace('wallet:balance:', '');
      result.checked++;

      try {
        const redisCents = await redis.get(key);
        if (redisCents === null) continue;

        const redisBalance = new Decimal(parseInt(redisCents, 10)).dividedBy(CENTS_SCALE);

        // Fetch DB balance
        const { data, error } = await client
          .from('wallets')
          .select('balance, user_id')
          .eq('id', walletId)
          .single();

        if (error || !data) {
          console.error(`[reconcile] Wallet ${walletId} in Redis but not in DB`);
          result.discrepancies++;
          continue;
        }

        const dbBalance = new Decimal(data.balance);
        const diff = redisBalance.minus(dbBalance).abs();

        if (diff.greaterThan(TOLERANCE)) {
          console.error(
            `[reconcile] DISCREPANCY wallet=${walletId} user=${data.user_id} ` +
            `redis=${redisBalance.toFixed(4)} db=${dbBalance.toFixed(4)} diff=${diff.toFixed(4)}`,
          );
          result.discrepancies++;
        }
      } catch (e) {
        console.error(`[reconcile] Error processing wallet=${walletId}:`, e);
        result.errors++;
      }
    }

    console.log(
      `[reconcile] Redis↔DB check complete: ` +
      `checked=${result.checked} discrepancies=${result.discrepancies} errors=${result.errors}`,
    );
  } finally {
    redis.disconnect();
  }

  return result;
}
