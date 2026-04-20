-- Household finance scenario testing schema (Sweden-focused)
-- Run this after enabling the pgcrypto extension in Supabase.

create extension if not exists pgcrypto;

create schema if not exists app;

create table if not exists app.households (
  id uuid primary key default gen_random_uuid(),
  household_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists app.profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  auth_user_id uuid unique,
  display_name text not null,
  role_label text not null default 'member',
  monthly_brutto_income_sek numeric(12, 2) not null default 0,
  annual_sgi_sek numeric(12, 2) not null default 0,
  is_akassa_member boolean not null default false,
  employment_mode text not null check (
    employment_mode in ('employed', 'parental_leave', 'unemployed', 'studying', 'self_employed')
  ),
  working_percentage numeric(5, 2) not null default 100 check (working_percentage >= 0 and working_percentage <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.loans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  label text not null,
  principal_sek numeric(14, 2) not null,
  annual_interest_rate_pct numeric(6, 3) not null,
  rate_type text not null check (rate_type in ('fixed', 'floating')),
  fixed_rate_expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.monthly_costs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  category text not null,
  cost_kind text not null check (cost_kind in ('fixed', 'variable')),
  amount_sek numeric(12, 2) not null,
  applies_to_profile_id uuid references app.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  asset_type text not null check (asset_type in ('house', 'investment_account', 'cash')),
  label text not null,
  current_value_sek numeric(14, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.scenarios (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  name text not null,
  transition_date_override date,
  config_snapshot jsonb not null,
  result_summary jsonb not null default '{}'::jsonb,
  created_by uuid references app.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.scenario_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  scenario_id uuid not null references app.scenarios(id) on delete cascade,
  event_date date not null,
  event_type text not null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  account_type text not null check (
    account_type in (
      'personal_cash',
      'household_cash',
      'housing_account',
      'savings_buffer',
      'investment_long_term',
      'investment_kids'
    )
  ),
  name text not null,
  balance_sek numeric(14, 2) not null default 0,
  min_amount_sek numeric(14, 2),
  absolute_floor_sek numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.month_locks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  month_key text not null,
  is_locked boolean not null default false,
  locked_by_profile_id uuid references app.profiles(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, month_key)
);

create table if not exists app.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  account_id uuid not null references app.accounts(id) on delete restrict,
  category_id uuid references app.categories(id) on delete set null,
  amount_sek numeric(12, 2) not null,
  transaction_date date not null,
  month_key text not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.income_states (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.income_components (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  income_state_id uuid not null references app.income_states(id) on delete cascade,
  component_type text not null,
  certainty text not null check (certainty in ('guaranteed', 'entitlement', 'estimated')),
  monthly_amount_sek numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references app.households(id) on delete cascade,
  goal_type text not null check (goal_type in ('one_off', 'recurring', 'bucket')),
  priority smallint not null check (priority between 1 and 3),
  source text not null check (source in ('cashflow', 'buffer', 'savings')),
  target_amount_sek numeric(14, 2),
  monthly_contribution_sek numeric(12, 2),
  deadline_date date,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on app.profiles;
create trigger set_profiles_updated_at
before update on app.profiles
for each row execute function app.set_updated_at();

drop trigger if exists set_loans_updated_at on app.loans;
create trigger set_loans_updated_at
before update on app.loans
for each row execute function app.set_updated_at();

drop trigger if exists set_monthly_costs_updated_at on app.monthly_costs;
create trigger set_monthly_costs_updated_at
before update on app.monthly_costs
for each row execute function app.set_updated_at();

drop trigger if exists set_assets_updated_at on app.assets;
create trigger set_assets_updated_at
before update on app.assets
for each row execute function app.set_updated_at();

drop trigger if exists set_scenarios_updated_at on app.scenarios;
create trigger set_scenarios_updated_at
before update on app.scenarios
for each row execute function app.set_updated_at();

drop trigger if exists set_scenario_events_updated_at on app.scenario_events;
create trigger set_scenario_events_updated_at
before update on app.scenario_events
for each row execute function app.set_updated_at();

drop trigger if exists set_accounts_updated_at on app.accounts;
create trigger set_accounts_updated_at
before update on app.accounts
for each row execute function app.set_updated_at();

drop trigger if exists set_categories_updated_at on app.categories;
create trigger set_categories_updated_at
before update on app.categories
for each row execute function app.set_updated_at();

drop trigger if exists set_month_locks_updated_at on app.month_locks;
create trigger set_month_locks_updated_at
before update on app.month_locks
for each row execute function app.set_updated_at();

drop trigger if exists set_transactions_updated_at on app.transactions;
create trigger set_transactions_updated_at
before update on app.transactions
for each row execute function app.set_updated_at();

drop trigger if exists set_income_states_updated_at on app.income_states;
create trigger set_income_states_updated_at
before update on app.income_states
for each row execute function app.set_updated_at();

drop trigger if exists set_income_components_updated_at on app.income_components;
create trigger set_income_components_updated_at
before update on app.income_components
for each row execute function app.set_updated_at();

drop trigger if exists set_goals_updated_at on app.goals;
create trigger set_goals_updated_at
before update on app.goals
for each row execute function app.set_updated_at();

-- The authenticated user is linked through profiles.auth_user_id.
create or replace function app.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = app
as $$
  select p.household_id
  from app.profiles p
  where p.auth_user_id = auth.uid()
  limit 1
$$;

alter table app.households enable row level security;
alter table app.profiles enable row level security;
alter table app.loans enable row level security;
alter table app.monthly_costs enable row level security;
alter table app.assets enable row level security;
alter table app.scenarios enable row level security;
alter table app.scenario_events enable row level security;
alter table app.accounts enable row level security;
alter table app.categories enable row level security;
alter table app.month_locks enable row level security;
alter table app.transactions enable row level security;
alter table app.income_states enable row level security;
alter table app.income_components enable row level security;
alter table app.goals enable row level security;

drop policy if exists household_access_households on app.households;
create policy household_access_households
on app.households
for all
using (id = app.current_household_id())
with check (id = app.current_household_id());

drop policy if exists household_access_profiles on app.profiles;
create policy household_access_profiles
on app.profiles
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_loans on app.loans;
create policy household_access_loans
on app.loans
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_monthly_costs on app.monthly_costs;
create policy household_access_monthly_costs
on app.monthly_costs
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_assets on app.assets;
create policy household_access_assets
on app.assets
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_scenarios on app.scenarios;
create policy household_access_scenarios
on app.scenarios
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_scenario_events on app.scenario_events;
create policy household_access_scenario_events
on app.scenario_events
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_accounts on app.accounts;
create policy household_access_accounts
on app.accounts
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_categories on app.categories;
create policy household_access_categories
on app.categories
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_month_locks on app.month_locks;
create policy household_access_month_locks
on app.month_locks
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_transactions on app.transactions;
create policy household_access_transactions
on app.transactions
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_income_states on app.income_states;
create policy household_access_income_states
on app.income_states
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_income_components on app.income_components;
create policy household_access_income_components
on app.income_components
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

drop policy if exists household_access_goals on app.goals;
create policy household_access_goals
on app.goals
for all
using (household_id = app.current_household_id())
with check (household_id = app.current_household_id());

-- ---------------------------------------------------------------------------
-- Phase 7 additions (entity lanes, bank accounts, recurring cost DnD, audits)
-- ---------------------------------------------------------------------------

create table if not exists public.app_entities (
  id text primary key,
  household_id text not null,
  name text not null,
  entity_type text not null check (entity_type in ('adult', 'child', 'company', 'shared')),
  notes text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_bank_accounts (
  id text primary key,
  household_id text not null,
  owner_entity_id text not null references public.app_entities(id) on delete cascade,
  name text not null,
  account_number text not null,
  account_category text not null check (account_category in ('bank', 'loan', 'credit')),
  current_balance_sek numeric(14, 2) not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_recurring_costs (
  id text primary key,
  household_id text not null,
  label text not null,
  amount_sek numeric(12, 2) not null default 0,
  assigned_entity_id text not null references public.app_entities(id) on delete restrict,
  lane_order integer not null default 0,
  spending_category_id text not null default 'other',
  schedule_start_date date,
  schedule_end_date date,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_recurring_cost_audit (
  id uuid primary key default gen_random_uuid(),
  recurring_cost_id text not null references public.app_recurring_costs(id) on delete cascade,
  household_id text not null,
  assigned_entity_id text not null references public.app_entities(id) on delete restrict,
  lane_order integer not null,
  amount_sek numeric(12, 2) not null,
  changed_by uuid,
  change_type text not null default 'upsert',
  created_at timestamptz not null default now()
);

alter table public.app_entities enable row level security;
alter table public.app_bank_accounts enable row level security;
alter table public.app_recurring_costs enable row level security;
alter table public.app_recurring_cost_audit enable row level security;

drop policy if exists household_access_app_entities on public.app_entities;
create policy household_access_app_entities
on public.app_entities
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

drop policy if exists household_access_app_bank_accounts on public.app_bank_accounts;
create policy household_access_app_bank_accounts
on public.app_bank_accounts
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

drop policy if exists household_access_app_recurring_costs on public.app_recurring_costs;
create policy household_access_app_recurring_costs
on public.app_recurring_costs
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

drop policy if exists household_access_app_recurring_cost_audit on public.app_recurring_cost_audit;
create policy household_access_app_recurring_cost_audit
on public.app_recurring_cost_audit
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

alter table public.app_recurring_costs
  add column if not exists flow_kind text not null default 'expense'
  check (flow_kind in ('expense', 'income'));

alter table public.app_recurring_costs
  add column if not exists spending_category_id text not null default 'other',
  add column if not exists schedule_start_date date,
  add column if not exists schedule_end_date date;

create table if not exists public.app_household_planning (
  household_id text primary key,
  calendar_days jsonb not null default '{}'::jsonb,
  work_rules jsonb not null default '[]'::jsonb,
  portal_snapshot jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.app_household_planning enable row level security;

drop policy if exists household_access_app_household_planning on public.app_household_planning;
create policy household_access_app_household_planning
on public.app_household_planning
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

create table if not exists public.app_household_config (
  household_id text primary key,
  config jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.app_household_config enable row level security;

drop policy if exists household_access_app_household_config on public.app_household_config;
create policy household_access_app_household_config
on public.app_household_config
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

create table if not exists public.app_scenarios (
  id text primary key,
  household_id text not null default 'demo-household-se-001',
  name text not null,
  definition jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists app_scenarios_household_id_idx
  on public.app_scenarios (household_id);

alter table public.app_scenarios enable row level security;

drop policy if exists household_access_app_scenarios on public.app_scenarios;
create policy household_access_app_scenarios
on public.app_scenarios
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

-- Named expense lists (e.g. renovation); lines stored as JSON on each row.
create table if not exists public.app_expense_tracker_boards (
  id text primary key,
  household_id text not null default 'demo-household-se-001',
  title text not null,
  items jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists app_expense_tracker_boards_household_id_idx
  on public.app_expense_tracker_boards (household_id);

alter table public.app_expense_tracker_boards enable row level security;

drop policy if exists household_access_app_expense_tracker_boards on public.app_expense_tracker_boards;
create policy household_access_app_expense_tracker_boards
on public.app_expense_tracker_boards
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');
