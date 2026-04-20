-- Household planning: ensure base table exists, then portal_snapshot + seed.
-- Safe when 20260417160000_household_planning_calendar.sql was never applied on this database.

create table if not exists public.app_household_planning (
  household_id text primary key,
  calendar_days jsonb not null default '{}'::jsonb,
  work_rules jsonb not null default '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.app_household_planning
  add column if not exists portal_snapshot jsonb not null default '{}'::jsonb;

comment on column public.app_household_planning.portal_snapshot is
  'Planning reference: Försäkringskassan child day balances, pension 65+ brackets, premiepension (JSON).';

alter table public.app_household_planning enable row level security;

drop policy if exists household_access_app_household_planning on public.app_household_planning;
create policy household_access_app_household_planning
on public.app_household_planning
for all
using (household_id = 'demo-household-se-001')
with check (household_id = 'demo-household-se-001');

-- Seed snapshot for demo household when empty (keeps existing non-empty portal_snapshot).
insert into public.app_household_planning (household_id, calendar_days, work_rules, portal_snapshot)
values (
  'demo-household-se-001',
  '{}'::jsonb,
  '[]'::jsonb,
  $snap$
{"sourceNote":"Sample planning reference (replace with your own extracts from Försäkringskassan / minpension / Pensionsmyndigheten).","unto":{"childLabel":"Child 2","totalRemaining":204,"totalCap":480,"duRemaining":115,"partnerRemaining":89,"sjukpenningnivaDu":70,"lagstaDu":45,"sjukpenningnivaPartner":44,"lagstaPartner":45,"dubbeldagarMax":60},"aaro":{"childLabel":"Child 1","totalRemaining":78.5,"totalCap":480,"duRemaining":45.75,"partnerRemaining":32.75,"sjukpenningnivaDu":9.5,"lagstaDu":36.25,"sjukpenningnivaPartner":0,"lagstaPartner":32.75},"pensionFrom65":{"title":"Din pension från 65 år","salaryTodaySek":40000,"brackets":[{"label":"65–66 år","sekPerMonth":15500},{"label":"66–67 år","sekPerMonth":15700},{"label":"67–68 år","sekPerMonth":15600},{"label":"68–69 år","sekPerMonth":15400},{"label":"69–75 år","sekPerMonth":16000},{"label":"75 år och livet ut","sekPerMonth":13500}]},"premiepension":{"title":"Premiepension","blurb":"Premiepensionen är en del av din allmänna pension som du kan påverka genom fondval.","totalValueSek":180264,"valueChangeYtdPct":5.7,"avgAnnualSinceStartPct":11.1,"portfolioFeePct":0.05,"avgCustomerFeePct":0.12}}
$snap$::jsonb
)
on conflict (household_id) do update set
  portal_snapshot = coalesce(
    nullif(public.app_household_planning.portal_snapshot, '{}'::jsonb),
    excluded.portal_snapshot
  );
