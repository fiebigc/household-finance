-- One row per named expense list (e.g. kitchen renovation); items are JSON lines { id, label, amountSek }.
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
