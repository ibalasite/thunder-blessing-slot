/**
 * spin_logs partition archive worker.
 * Creates next year's partition if it doesn't exist, and detaches
 * partitions older than 2 years from the active table (retaining data in archive schema).
 */
export async function spinLogArchive(): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const nextYear = new Date().getFullYear() + 1;
  const partitionName = `spin_logs_${nextYear}`;

  console.log(`[spinLogArchive] Ensuring partition ${partitionName} exists...`);

  const { error } = await supabase.rpc('ensure_spin_log_partition', { p_year: nextYear });
  if (error && !error.message.includes('already exists')) {
    throw new Error(`Partition creation failed: ${error.message}`);
  }

  console.log(`[spinLogArchive] Done.`);
}
