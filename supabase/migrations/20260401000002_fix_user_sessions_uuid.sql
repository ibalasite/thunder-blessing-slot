-- Migration: fix user_sessions.user_id to UUID → auth.users(id)
-- Problem: user_sessions.user_id was BIGINT referencing public.users(id),
--          but the app uses GoTrue UUID from auth.users.

-- 1. Drop old FK and change column type to UUID
ALTER TABLE public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE public.user_sessions ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;

-- 2. Add new FK → auth.users(id) with CASCADE delete
ALTER TABLE public.user_sessions
  ADD CONSTRAINT user_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
