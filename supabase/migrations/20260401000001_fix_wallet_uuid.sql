-- Migration: fix wallets.user_id to UUID → auth.users(id)
-- Problem: wallets.user_id was BIGINT referencing public.users(id),
--          but the app uses GoTrue UUID from auth.users.
--          This caused wallet lookup/creation to always fail.

-- 1. Drop old FK and change column type to UUID
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_user_id_fkey;
ALTER TABLE public.wallets ALTER COLUMN user_id TYPE UUID USING user_id::text::uuid;

-- 2. Add new FK → auth.users(id) with CASCADE delete
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Create wallet auto-creation function
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (NEW.id, 1000.0000, 'USD')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger: create wallet on every new auth.users row
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
