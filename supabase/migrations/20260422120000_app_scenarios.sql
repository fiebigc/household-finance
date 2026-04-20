-- User-built scenarios (tiles + events JSON). One row per scenario per household.
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
