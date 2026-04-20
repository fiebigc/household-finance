-- Household planning: calendar day marks (H/C/A/U) + work schedule segments + optional counters.
-- JSON shapes are validated in app code; DB stores flexible planning payloads.

create table if not exists public.app_household_planning (
  household_id text primary key,
  /** Map of "YYYY-MM-DD" -> { "H"|"C"|"A"|"U": "PL"|"WK"|"AK"|"" } */
  calendar_days jsonb not null default '{}'::jsonb,
  /** [{ "adultId": "adult1"|"adult2", "validFrom": "YYYY-MM-DD", "validTo": "YYYY-MM-DD", "workingPercentage": number, "daysPerWeek": number }] */
  work_rules jsonb not null default '[]'::jsonb,
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
