-- Production RLS: require Supabase Auth (JWT). No anon access to app data.
-- Run after users exist in auth.users. Backfills user_id from email where possible.

-- ── user_persona_settings: owner = auth.uid() ───────────────────────────
ALTER TABLE public.user_persona_settings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

UPDATE public.user_persona_settings ups
SET user_id = au.id
FROM auth.users au
WHERE ups.user_id IS NULL
  AND lower(trim(au.email)) = lower(trim(ups.user_email));

DELETE FROM public.user_persona_settings WHERE user_id IS NULL;

ALTER TABLE public.user_persona_settings
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.user_persona_settings
  DROP CONSTRAINT IF EXISTS user_persona_settings_user_email_persona_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_persona_settings_user_persona_uid
  ON public.user_persona_settings (user_id, persona_id);

DROP POLICY IF EXISTS "Anon can read persona settings" ON public.user_persona_settings;
DROP POLICY IF EXISTS "Anon can insert persona settings" ON public.user_persona_settings;
DROP POLICY IF EXISTS "Anon can update persona settings" ON public.user_persona_settings;

CREATE POLICY "Users select own persona settings"
  ON public.user_persona_settings FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users insert own persona settings"
  ON public.user_persona_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users update own persona settings"
  ON public.user_persona_settings FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users delete own persona settings"
  ON public.user_persona_settings FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ── bank_accounts: per-owner rows ─────────────────────────────────────────
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Single-tenant backfill: attach existing CSV imports to the oldest auth user.
UPDATE public.bank_accounts ba
SET user_id = u.id
FROM (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1) u
WHERE ba.user_id IS NULL;

DROP POLICY IF EXISTS "Anon users can read bank_accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Authenticated users can read bank_accounts" ON public.bank_accounts;

CREATE POLICY "Users read own bank_accounts"
  ON public.bank_accounts FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Anon users can read bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Authenticated users can read bank_transactions" ON public.bank_transactions;

CREATE POLICY "Users read own bank_transactions"
  ON public.bank_transactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_accounts ba
      WHERE ba.id = bank_transactions.bank_account_id
        AND ba.user_id = (select auth.uid())
    )
  );
