create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  date date not null check (date between date '0001-01-01' and date '9999-12-31'),
  amount_cents integer not null check (amount_cents > 0),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  category text not null check (char_length(btrim(category)) between 1 and 100),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index financial_transactions_owner_date_idx on public.financial_transactions(user_id, date desc, id);
create function routine_private.guard_financial_transaction() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Transaction identity is immutable' using errcode = '23514';
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function routine_private.guard_financial_transaction() from public, anon, authenticated;
create trigger guard_financial_transaction before insert or update on public.financial_transactions
  for each row execute function routine_private.guard_financial_transaction();
alter table public.financial_transactions enable row level security;
create policy financial_transactions_select on public.financial_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy financial_transactions_insert on public.financial_transactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy financial_transactions_update on public.financial_transactions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.financial_transactions from public, anon, authenticated;
grant select on public.financial_transactions to authenticated;
grant insert (id, user_id, type, date, amount_cents, description, category) on public.financial_transactions to authenticated;
grant update (type, date, amount_cents, description, category) on public.financial_transactions to authenticated;
