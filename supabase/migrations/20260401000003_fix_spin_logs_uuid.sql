-- Migration: fix spin_logs.user_id to UUID
-- Problem: spin_logs.user_id was BIGINT but app uses GoTrue UUID.
-- spin_logs is PARTITIONED so no FK constraint — just change the type.

-- The column has no FK constraint (partition table limitation), so we can
-- alter it directly. The change propagates to all partitions automatically.
ALTER TABLE public.spin_logs ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;
