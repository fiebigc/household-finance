-- Production hardening: move public app_* tables from demo household-id policies
-- to authenticated per-user tenancy.

alter table if exists public.app_entities
  alter column household_id set default (auth.uid()::text);

alter table if exists public.app_bank_accounts
  alter column household_id set default (auth.uid()::text);

alter table if exists public.app_recurring_costs
  alter column household_id set default (auth.uid()::text);

alter table if exists public.app_recurring_cost_audit
  alter column household_id set default (auth.uid()::text);

alter table if exists public.app_household_planning
  alter column household_id set default (auth.uid()::text);

alter table if exists public.app_household_config
  alter column household_id set default (auth.uid()::text);

alter table if exists public.app_scenarios
  alter column household_id set default (auth.uid()::text);

alter table if exists public.app_expense_tracker_boards
  alter column household_id set default (auth.uid()::text);

drop policy if exists household_access_app_entities on public.app_entities;
create policy household_access_app_entities
on public.app_entities
for all
using (auth.uid() is not null and household_id = auth.uid()::text)
with check (auth.uid() is not null and household_id = auth.uid()::text);

drop policy if exists household_access_app_bank_accounts on public.app_bank_accounts;
create policy household_access_app_bank_accounts
on public.app_bank_accounts
for all
using (auth.uid() is not null and household_id = auth.uid()::text)
with check (auth.uid() is not null and household_id = auth.uid()::text);

drop policy if exists household_access_app_recurring_costs on public.app_recurring_costs;
create policy household_access_app_recurring_costs
on public.app_recurring_costs
for all
using (auth.uid() is not null and household_id = auth.uid()::text)
with check (auth.uid() is not null and household_id = auth.uid()::text);

drop policy if exists household_access_app_recurring_cost_audit on public.app_recurring_cost_audit;
create policy household_access_app_recurring_cost_audit
on public.app_recurring_cost_audit
for all
using (auth.uid() is not null and household_id = auth.uid()::text)
with check (auth.uid() is not null and household_id = auth.uid()::text);

drop policy if exists household_access_app_household_planning on public.app_household_planning;
create policy household_access_app_household_planning
on public.app_household_planning
for all
using (auth.uid() is not null and household_id = auth.uid()::text)
with check (auth.uid() is not null and household_id = auth.uid()::text);

drop policy if exists household_access_app_household_config on public.app_household_config;
create policy household_access_app_household_config
on public.app_household_config
for all
using (auth.uid() is not null and household_id = auth.uid()::text)
with check (auth.uid() is not null and household_id = auth.uid()::text);

drop policy if exists household_access_app_scenarios on public.app_scenarios;
create policy household_access_app_scenarios
on public.app_scenarios
for all
using (auth.uid() is not null and household_id = auth.uid()::text)
with check (auth.uid() is not null and household_id = auth.uid()::text);

drop policy if exists household_access_app_expense_tracker_boards on public.app_expense_tracker_boards;
create policy household_access_app_expense_tracker_boards
on public.app_expense_tracker_boards
for all
using (auth.uid() is not null and household_id = auth.uid()::text)
with check (auth.uid() is not null and household_id = auth.uid()::text);
