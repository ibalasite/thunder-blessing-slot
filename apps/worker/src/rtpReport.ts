import { createClient } from '@supabase/supabase-js';

/**
 * Daily RTP audit worker.
 * Queries spin_logs for yesterday's data, computes RTP per mode,
 * inserts into rtp_daily_reports, and alerts if outside 97.5% ± 0.5%.
 */
export async function rtpReport(): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  console.log(`[rtpReport] Computing RTP for ${dateStr}...`);

  const { data, error } = await supabase.rpc('compute_daily_rtp', { p_date: dateStr });
  if (error) {
    throw new Error(`RTP report query failed: ${error.message}`);
  }

  console.log(`[rtpReport] Done. Results:`, data);
}
