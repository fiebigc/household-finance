-- Allow additional auth users (e.g. partner) to read the same bank_accounts rows
-- via bank_account_access, without duplicating account data.

CREATE TABLE IF NOT EXISTS public.bank_account_access (
  bank_account_id text NOT NULL REFERENCES public.bank_accounts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bank_account_id, user_id)
);

CREATE INDEX IF NOT EXISTS bank_account_access_user_idx
  ON public.bank_account_access (user_id);

COMMENT ON TABLE public.bank_account_access IS
  'Users granted read access to a bank account in addition to bank_accounts.user_id.';

ALTER TABLE public.bank_account_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own bank_account_access rows"
  ON public.bank_account_access
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users read own bank_accounts" ON public.bank_accounts;
CREATE POLICY "Users read bank_accounts via owner or access"
  ON public.bank_accounts
  FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.bank_account_access baa
      WHERE baa.bank_account_id = bank_accounts.id
        AND baa.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users read own bank_transactions" ON public.bank_transactions;
CREATE POLICY "Users read bank_transactions via account access"
  ON public.bank_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_accounts ba
      WHERE ba.id = bank_transactions.bank_account_id
        AND (
          ba.user_id = (select auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.bank_account_access baa
            WHERE baa.bank_account_id = ba.id
              AND baa.user_id = (select auth.uid())
          )
        )
    )
  );
