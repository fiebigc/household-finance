-- Recurring row type (expense vs income) and persisted household JSON draft.
alter table public.app_recurring_costs
  add column if not exists flow_kind text not null default 'expense'
  check (flow_kind in ('expense', 'income'));

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
