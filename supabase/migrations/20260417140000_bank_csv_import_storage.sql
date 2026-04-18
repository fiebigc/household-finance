-- Swedish bank CSV export storage: deduplicated lines + recurring detection flags.
--
-- If the app returns [PGRST205] Could not find the table 'public.app_bank_import_batches':
--   Supabase Dashboard → SQL → paste this entire file → Run.
--   bank_account_id is plain text (matches app_bank_accounts.id in the app) so this runs without FK order issues.

create table if not exists public.app_bank_import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  source_label text,
  created_at timestamptz not null default now(),
  rows_parsed integer not null default 0,
  rows_inserted integer not null default 0,
  rows_skipped_duplicate integer not null default 0
);

create table if not exists public.app_bank_transaction_lines (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  bank_account_id text not null,
  import_batch_id uuid references public.app_bank_import_batches (id) on delete set null,
  booked_date date not null,
  amount_sek numeric(14, 2) not null,
  specification text not null default '',
  spec_canonical text not null,
  dedupe_key text not null,
  is_recurring_signal boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, dedupe_key)
);

create index if not exists idx_app_bank_lines_household_booked
  on public.app_bank_transaction_lines (household_id, booked_date desc);

create index if not exists idx_app_bank_lines_recurring
  on public.app_bank_transaction_lines (household_id, is_recurring_signal)
  where is_recurring_signal = true;

alter table public.app_bank_import_batches enable row level security;
alter table public.app_bank_transaction_lines enable row level security;

drop policy if exists household_access_app_bank_import_batches on public.app_bank_import_batches;
create policy household_access_app_bank_import_batches
on public.app_bank_import_batches
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

drop policy if exists household_access_app_bank_transaction_lines on public.app_bank_transaction_lines;
create policy household_access_app_bank_transaction_lines
on public.app_bank_transaction_lines
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

-- Same amount + same source + same booking date => one logical row; re-imports skip via dedupe_key.
-- Same amount + same source on different months => recurring budgeting signal (all rows in the group flagged).
create or replace function public.refresh_bank_transaction_recurring_flags(p_household_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.app_bank_transaction_lines
  set is_recurring_signal = false
  where household_id = p_household_id;

  update public.app_bank_transaction_lines t
  set is_recurring_signal = true
  from (
    select
      household_id,
      bank_account_id,
      spec_canonical,
      amount_sek
    from public.app_bank_transaction_lines
    where household_id = p_household_id
    group by household_id, bank_account_id, spec_canonical, amount_sek
    having count(*) >= 2
      and count(distinct date_trunc('month', booked_date)) >= 2
  ) g
  where t.household_id = g.household_id
    and t.bank_account_id = g.bank_account_id
    and t.spec_canonical = g.spec_canonical
    and t.amount_sek = g.amount_sek;
end;
$$;

-- Bulk insert from client JSON; skips duplicates and refreshes recurring flags for the household.
create or replace function public.bank_csv_import_apply(
  p_household_id text,
  p_bank_account_id text,
  p_import_batch_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted int;
  v_total int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'error', 'invalid_rows');
  end if;

  v_total := coalesce(jsonb_array_length(p_rows), 0);

  insert into public.app_bank_transaction_lines (
    household_id,
    bank_account_id,
    import_batch_id,
    booked_date,
    amount_sek,
    specification,
    spec_canonical,
    dedupe_key
  )
  select
    p_household_id,
    p_bank_account_id,
    p_import_batch_id,
    (elem->>'booked_date')::date,
    (elem->>'amount_sek')::numeric,
    coalesce(elem->>'specification', ''),
    elem->>'spec_canonical',
    elem->>'dedupe_key'
  from jsonb_array_elements(p_rows) as elem
  on conflict (household_id, dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', greatest(v_total - v_inserted, 0),
    'parsed', v_total
  );
end;
$$;

grant execute on function public.refresh_bank_transaction_recurring_flags(text) to anon, authenticated;
grant execute on function public.bank_csv_import_apply(text, text, uuid, jsonb) to anon, authenticated;

grant select, insert, update, delete on public.app_bank_import_batches to anon, authenticated, service_role;
grant select, insert, update, delete on public.app_bank_transaction_lines to anon, authenticated, service_role;

-- Refresh PostgREST schema cache so new tables appear to the API immediately.
notify pgrst, 'reload schema';
