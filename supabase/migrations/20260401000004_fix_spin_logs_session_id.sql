-- Migration: fix spin_logs.session_id to TEXT
-- Problem: session_id was BIGINT but the app passes string session IDs
--          (e.g. "e2e-test-session" from x-session-id header).

ALTER TABLE public.spin_logs ALTER COLUMN session_id TYPE TEXT USING session_id::text;
