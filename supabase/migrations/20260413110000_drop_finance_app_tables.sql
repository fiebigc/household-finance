-- Drop finance app tables and helpers (safe re-run)

drop table if exists app.scenario_events cascade;
drop table if exists app.scenarios cascade;
drop table if exists app.goals cascade;
drop table if exists app.income_components cascade;
drop table if exists app.income_states cascade;
drop table if exists app.transactions cascade;
drop table if exists app.month_locks cascade;
drop table if exists app.categories cascade;
drop table if exists app.accounts cascade;
drop table if exists app.assets cascade;
drop table if exists app.monthly_costs cascade;
drop table if exists app.loans cascade;
drop table if exists app.profiles cascade;
drop table if exists app.households cascade;

drop function if exists app.current_household_id() cascade;
drop function if exists app.set_updated_at() cascade;

drop schema if exists app cascade;
