-- Household finance initial schema
-- Derived from docs/ENTITIES.md, docs/ACCOUNTS.md, docs/GOALS.md

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type public.account_type as enum (
      'personal_cash',
      'household_cash',
      'housing_account',
      'savings_buffer',
      'investment_long_term',
      'investment_kids'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'income_component_type') then
    create type public.income_component_type as enum (
      'salary',
      'parental_leave',
      'child_benefit',
      'self_employed_estimate'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'income_certainty') then
    create type public.income_certainty as enum (
      'guaranteed',
      'entitlement',
      'estimated'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'goal_type') then
    create type public.goal_type as enum ('one_off', 'recurring', 'bucket');
  end if;

  if not exists (select 1 from pg_type where typname = 'goal_source') then
    create type public.goal_source as enum ('cashflow', 'buffer', 'savings');
  end if;
end
$$;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type public.account_type not null,
  balance numeric(14,2) not null default 0,
  min_amount numeric(14,2),
  absolute_floor numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_buffer_fields_check check (
    account_type = 'savings_buffer'
    or (min_amount is null and absolute_floor is null)
  ),
  constraint account_buffer_thresholds_check check (
    min_amount is null
    or absolute_floor is null
    or absolute_floor <= min_amount
  )
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.income_states (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists income_states_single_active_idx
  on public.income_states (is_active)
  where is_active = true;

create table if not exists public.income_components (
  id uuid primary key default gen_random_uuid(),
  income_state_id uuid not null references public.income_states(id) on delete cascade,
  component_type public.income_component_type not null,
  certainty public.income_certainty not null,
  monthly_amount numeric(14,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal_type public.goal_type not null,
  priority smallint not null check (priority between 1 and 3),
  source public.goal_source not null,
  target_amount numeric(14,2),
  monthly_contribution numeric(14,2),
  deadline date,
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_amount_present_check check (
    target_amount is not null or monthly_contribution is not null
  )
);

create table if not exists public.buffers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  min_amount numeric(14,2) not null,
  absolute_floor numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buffers_thresholds_check check (absolute_floor <= min_amount)
);

create table if not exists public.closed_months (
  month_start date primary key,
  closed_at timestamptz not null default now()
);

create or replace function public.month_start(d date) returns date
  language sql immutable parallel safe as
  $$ select make_date(extract(year from d)::int, extract(month from d)::int, 1) $$;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  amount numeric(14,2) not null,
  transaction_date date not null,
  transaction_month date generated always as (public.month_start(transaction_date)) stored,
  account_id uuid not null references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_month_idx on public.transactions (transaction_month);
create index if not exists transactions_account_idx on public.transactions (account_id);
create index if not exists transactions_category_idx on public.transactions (category_id);

create or replace function public.prevent_locked_month_transactions()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1
      from public.closed_months cm
      where cm.month_start = new.transaction_month
    ) then
      raise exception 'Transactions are locked for month %', new.transaction_month;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if exists (
      select 1
      from public.closed_months cm
      where cm.month_start in (old.transaction_month, new.transaction_month)
    ) then
      raise exception 'Transactions are locked for month %', new.transaction_month;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if exists (
      select 1
      from public.closed_months cm
      where cm.month_start = old.transaction_month
    ) then
      raise exception 'Transactions are locked for month %', old.transaction_month;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists transactions_locked_month_guard on public.transactions;
create trigger transactions_locked_month_guard
before insert or update or delete on public.transactions
for each row execute function public.prevent_locked_month_transactions();
