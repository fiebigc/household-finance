-- Household Finance App — Full Schema v1.1.0
-- Generated from docs/SCHEMA.md

-- ── Households ──────────────────────────────────────────
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  currency    text not null default 'SEK',
  country     text not null default 'SE',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Household members (links auth.users to households) ──
create table if not exists household_members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'owner',
  created_at    timestamptz not null default now(),
  unique(household_id, user_id)
);

-- ── Entities ────────────────────────────────────────────
create table if not exists entities (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  type            text not null check (type in ('adult','child','company')),
  name            text not null,
  birth_date      date,
  tax_id          text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create index if not exists idx_entities_household on entities(household_id);

-- ── Accounts ────────────────────────────────────────────
create table if not exists accounts (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid not null references entities(id) on delete cascade,
  type                  text not null check (type in ('bank','savings','investment','loan','pension','credit')),
  name                  text not null,
  iban                  text,
  currency              text not null default 'SEK',
  balance_snapshot      numeric not null default 0,
  balance_snapshot_date date,
  bank_name             text,
  csv_parser_config_id  uuid,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  archived_at           timestamptz
);

create index if not exists idx_accounts_entity on accounts(entity_id);

-- ── Periods ─────────────────────────────────────────────
create table if not exists periods (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid not null references entities(id) on delete cascade,
  type                text not null check (type in (
    'employed','self_employed','parental_leave','unemployed',
    'unpaid_leave','sick_leave','daycare','home','school','preschool'
  )),
  date_from           date not null,
  date_to             date,
  pct_fte             numeric check (pct_fte >= 0 and pct_fte <= 100),
  weekly_pattern      jsonb,
  employer_entity_id  uuid references entities(id),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz
);

create index if not exists idx_periods_entity on periods(entity_id);

-- ── Period day overrides ────────────────────────────────
create table if not exists period_day_overrides (
  id             uuid primary key default gen_random_uuid(),
  period_id      uuid not null references periods(id) on delete cascade,
  entity_id      uuid not null references entities(id) on delete cascade,
  date           date not null,
  override_type  text not null check (override_type in ('active','inactive')),
  reason         text check (reason in ('public_holiday','sick','vacation','ad_hoc','other')),
  notes          text,
  created_at     timestamptz not null default now(),
  unique(period_id, date)
);

-- ── Cashflows ───────────────────────────────────────────
create table if not exists cashflows (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references entities(id) on delete cascade,
  account_id         uuid references accounts(id),
  direction          text not null check (direction in ('income','expense')),
  category           text not null check (category in (
    'salary','dividend','freelance','rent','mortgage','childcare',
    'groceries','transport','insurance','subscription','utility',
    'loan_repayment','savings_transfer','other'
  )),
  name               text not null,
  amount             numeric not null,
  currency           text not null default 'SEK',
  frequency          text not null check (frequency in ('daily','weekly','biweekly','monthly','quarterly','annually','one_off')),
  date_from          date not null,
  date_to            date,
  is_gross           boolean not null default true,
  tax_rate_override  numeric,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);

create index if not exists idx_cashflows_entity on cashflows(entity_id);

-- ── Loans ───────────────────────────────────────────────
create table if not exists loans (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references accounts(id) on delete cascade,
  name               text not null,
  type               text not null check (type in ('mortgage','car','student','personal','other')),
  rate_type          text not null check (rate_type in ('fixed','floating')),
  principal          numeric not null,
  outstanding        numeric not null,
  interest_rate      numeric not null,
  rate_index         text,
  rate_margin        numeric,
  rate_fixed_until   date,
  amortization_type  text not null default 'annuity' check (amortization_type in ('annuity','straight_line','interest_only','custom')),
  monthly_payment    numeric,
  start_date         date not null,
  end_date           date,
  currency           text not null default 'SEK',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Benefits ────────────────────────────────────────────
create table if not exists benefits (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references entities(id) on delete cascade,
  period_id        uuid references periods(id),
  type             text not null check (type in (
    'parental_leave_pay','unemployment_benefit','child_benefit',
    'housing_allowance','sickness_benefit','pension_supplement','other'
  )),
  source           text not null check (source in ('computed','csv_import','manual')),
  amount           numeric not null,
  currency         text not null default 'SEK',
  frequency        text not null check (frequency in ('daily','weekly','monthly','one_off')),
  date_from        date not null,
  date_to          date,
  is_taxable       boolean not null default false,
  notes            text,
  import_batch_id  uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);

-- ── Transactions ────────────────────────────────────────
create table if not exists transactions (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references accounts(id) on delete cascade,
  import_batch_id  uuid,
  date             date not null,
  amount           numeric not null,
  currency         text not null default 'SEK',
  description      text not null,
  category         text,
  cashflow_id      uuid references cashflows(id),
  is_reviewed      boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_transactions_account on transactions(account_id);
create index if not exists idx_transactions_date on transactions(date);

-- ── CSV parser configs ──────────────────────────────────
create table if not exists csv_parser_configs (
  id                       uuid primary key default gen_random_uuid(),
  household_id             uuid not null references households(id) on delete cascade,
  bank_name                text not null,
  file_type                text not null check (file_type in ('bank_statement','loan_statement','benefit_payment','expense_export')),
  delimiter                text not null default ',',
  encoding                 text not null default 'UTF-8',
  skip_rows                integer not null default 0,
  column_map               jsonb not null,
  date_format              text not null,
  amount_sign_convention   text not null default 'negative_is_debit' check (amount_sign_convention in ('negative_is_debit','positive_is_debit','separate_columns')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── CSV imports log ─────────────────────────────────────
create table if not exists csv_imports (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid references accounts(id),
  parser_config_id  uuid not null references csv_parser_configs(id),
  filename          text not null,
  imported_at       timestamptz not null default now(),
  row_count         integer not null default 0,
  status            text not null check (status in ('pending','complete','error','partial')),
  error_log         text
);

-- ── Tax profiles ────────────────────────────────────────
create table if not exists tax_profiles (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references entities(id) on delete cascade,
  year        integer not null,
  method      text not null default 'flat_rate' check (method in ('flat_rate','brackets')),
  flat_rate   numeric,
  brackets    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(entity_id, year)
);

-- ── Projection scenarios ────────────────────────────────
create table if not exists projection_scenarios (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references households(id) on delete cascade,
  name                  text not null,
  description           text,
  is_baseline           boolean not null default false,
  period_overrides      jsonb not null default '[]',
  assumption_overrides  jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── User card layouts (per-user bento preferences) ──────
create table if not exists user_card_layouts (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tab         text not null,
  cards       jsonb not null default '[]',
  updated_at  timestamptz not null default now(),
  unique(user_id, tab)
);

-- ── updated_at trigger ──────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  for tbl in
    select unnest(array[
      'households','entities','accounts','periods','cashflows',
      'loans','benefits','tax_profiles','projection_scenarios',
      'csv_parser_configs','user_card_layouts'
    ])
  loop
    execute format(
      'drop trigger if exists trg_updated_at on %I; create trigger trg_updated_at before update on %I for each row execute function set_updated_at();',
      tbl, tbl
    );
  end loop;
end $$;

-- ── RLS ─────────────────────────────────────────────────
alter table households enable row level security;
alter table household_members enable row level security;
alter table entities enable row level security;
alter table accounts enable row level security;
alter table periods enable row level security;
alter table period_day_overrides enable row level security;
alter table cashflows enable row level security;
alter table loans enable row level security;
alter table benefits enable row level security;
alter table transactions enable row level security;
alter table csv_parser_configs enable row level security;
alter table csv_imports enable row level security;
alter table tax_profiles enable row level security;
alter table projection_scenarios enable row level security;
alter table user_card_layouts enable row level security;

-- Helper: get household IDs for current user
create or replace function my_household_ids()
returns setof uuid
language sql stable security definer
as $$
  select household_id from household_members where user_id = auth.uid();
$$;

-- Households: members can read/write their own
create policy "hh_select" on households for select using (id in (select my_household_ids()));
create policy "hh_insert" on households for insert with check (true);
create policy "hh_update" on households for update using (id in (select my_household_ids()));

-- Household members
create policy "hm_select" on household_members for select using (user_id = auth.uid() or household_id in (select my_household_ids()));
create policy "hm_insert" on household_members for insert with check (true);

-- Entities
create policy "ent_select" on entities for select using (household_id in (select my_household_ids()));
create policy "ent_insert" on entities for insert with check (household_id in (select my_household_ids()));
create policy "ent_update" on entities for update using (household_id in (select my_household_ids()));

-- Accounts (via entity → household)
create policy "acc_select" on accounts for select using (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "acc_insert" on accounts for insert with check (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "acc_update" on accounts for update using (entity_id in (select id from entities where household_id in (select my_household_ids())));

-- Periods
create policy "per_select" on periods for select using (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "per_insert" on periods for insert with check (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "per_update" on periods for update using (entity_id in (select id from entities where household_id in (select my_household_ids())));

-- Day overrides
create policy "pdo_select" on period_day_overrides for select using (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "pdo_insert" on period_day_overrides for insert with check (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "pdo_update" on period_day_overrides for update using (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "pdo_delete" on period_day_overrides for delete using (entity_id in (select id from entities where household_id in (select my_household_ids())));

-- Cashflows
create policy "cf_select" on cashflows for select using (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "cf_insert" on cashflows for insert with check (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "cf_update" on cashflows for update using (entity_id in (select id from entities where household_id in (select my_household_ids())));

-- Loans (via account → entity → household)
create policy "loan_select" on loans for select using (account_id in (select id from accounts where entity_id in (select id from entities where household_id in (select my_household_ids()))));
create policy "loan_insert" on loans for insert with check (account_id in (select id from accounts where entity_id in (select id from entities where household_id in (select my_household_ids()))));
create policy "loan_update" on loans for update using (account_id in (select id from accounts where entity_id in (select id from entities where household_id in (select my_household_ids()))));

-- Benefits
create policy "ben_select" on benefits for select using (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "ben_insert" on benefits for insert with check (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "ben_update" on benefits for update using (entity_id in (select id from entities where household_id in (select my_household_ids())));

-- Transactions
create policy "tx_select" on transactions for select using (account_id in (select id from accounts where entity_id in (select id from entities where household_id in (select my_household_ids()))));
create policy "tx_insert" on transactions for insert with check (account_id in (select id from accounts where entity_id in (select id from entities where household_id in (select my_household_ids()))));

-- CSV parser configs
create policy "cpc_select" on csv_parser_configs for select using (household_id in (select my_household_ids()));
create policy "cpc_insert" on csv_parser_configs for insert with check (household_id in (select my_household_ids()));
create policy "cpc_update" on csv_parser_configs for update using (household_id in (select my_household_ids()));

-- CSV imports
create policy "ci_select" on csv_imports for select using (true);
create policy "ci_insert" on csv_imports for insert with check (true);

-- Tax profiles
create policy "tp_select" on tax_profiles for select using (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "tp_insert" on tax_profiles for insert with check (entity_id in (select id from entities where household_id in (select my_household_ids())));
create policy "tp_update" on tax_profiles for update using (entity_id in (select id from entities where household_id in (select my_household_ids())));

-- Projection scenarios
create policy "ps_select" on projection_scenarios for select using (household_id in (select my_household_ids()));
create policy "ps_insert" on projection_scenarios for insert with check (household_id in (select my_household_ids()));
create policy "ps_update" on projection_scenarios for update using (household_id in (select my_household_ids()));
create policy "ps_delete" on projection_scenarios for delete using (household_id in (select my_household_ids()));

-- User card layouts
create policy "ucl_select" on user_card_layouts for select using (user_id = auth.uid());
create policy "ucl_insert" on user_card_layouts for insert with check (user_id = auth.uid());
create policy "ucl_update" on user_card_layouts for update using (user_id = auth.uid());
