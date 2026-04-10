-- Seed bank account ownership for existing rows (single-tenant default).
-- Assign every bank account to the oldest auth user.
do $$
declare
  owner_id uuid;
begin
  select id into owner_id
  from auth.users
  order by created_at asc
  limit 1;

  if owner_id is null then
    raise exception 'No auth.users rows exist. Create at least one user first.';
  end if;

  update public.bank_accounts
  set user_id = owner_id
  where user_id is null;
end
$$;
