-- Optional schedule window + UI category for recurring cash-flow rows.
alter table public.app_recurring_costs
  add column if not exists spending_category_id text not null default 'other',
  add column if not exists schedule_start_date date,
  add column if not exists schedule_end_date date;
