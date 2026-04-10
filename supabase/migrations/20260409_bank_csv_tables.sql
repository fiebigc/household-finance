-- Bank CSV import tables
-- Stores raw transaction and account data parsed from Danske Bank CSV exports.
-- Does NOT alter existing tables (accounts, transactions, etc.).

create table if not exists public.bank_accounts (
  id text primary key,
  source_file text,
  label text not null,
  balance_sek numeric(14,2),
  owners text[] not null default '{}',
  category text not null,
  notes text,
  import_date date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.bank_accounts is
  'Snapshot of bank accounts parsed from Danske Bank CSV exports.';

create table if not exists public.bank_transactions (
  id bigint generated always as identity primary key,
  bank_account_id text not null references public.bank_accounts(id) on delete cascade,
  transaction_date date not null,
  specifikation text not null default '',
  belopp numeric(14,2) not null,
  saldo numeric(14,2),
  created_at timestamptz not null default now()
);

create index if not exists bank_tx_account_idx on public.bank_transactions (bank_account_id);
create index if not exists bank_tx_date_idx on public.bank_transactions (transaction_date);

comment on table public.bank_transactions is
  'All completed transactions from Danske Bank CSV exports, one row per booking line.';

-- RLS: allow authenticated reads, restrict writes to service role
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;

create policy "Authenticated users can read bank_accounts"
  on public.bank_accounts for select
  to authenticated
  using (true);

create policy "Authenticated users can read bank_transactions"
  on public.bank_transactions for select
  to authenticated
  using (true);

create policy "Service role can manage bank_accounts"
  on public.bank_accounts for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage bank_transactions"
  on public.bank_transactions for all
  to service_role
  using (true)
  with check (true);
