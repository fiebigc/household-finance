-- Allow anon role to read bank data (app uses demo auth, not Supabase auth)
create policy "Anon users can read bank_accounts"
  on public.bank_accounts for select
  to anon
  using (true);

create policy "Anon users can read bank_transactions"
  on public.bank_transactions for select
  to anon
  using (true);
