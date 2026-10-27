-- Monthly bills: immutable snapshots, owner-only reads and narrowly scoped atomic writes.
create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  default_amount_cents integer not null check (default_amount_cents > 0),
  due_day integer not null check (due_day between 1 and 31),
  category text not null default 'Contas fixas' check (char_length(btrim(category)) between 1 and 100),
  active boolean not null default true,
  starts_on date not null check (starts_on between date '0001-01-01' and date '9999-12-01' and extract(day from starts_on)=1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(user_id,id)
);
create table public.fixed_expense_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fixed_expense_id uuid not null,
  reference_month date not null check (reference_month between date '0001-01-01' and date '9999-12-01' and extract(day from reference_month)=1),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  due_day integer not null check (due_day between 1 and 31),
  category text not null check (char_length(btrim(category)) between 1 and 100),
  amount_cents integer not null check (amount_cents > 0),
  paid_at timestamptz,
  financial_transaction_id uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((paid_at is null) = (financial_transaction_id is null)),
  unique(user_id,id),
  unique(user_id,fixed_expense_id,reference_month),
  constraint fixed_expense_months_owner_expense_fkey foreign key(user_id,fixed_expense_id) references public.fixed_expenses(user_id,id)
);
alter table public.financial_transactions add column fixed_expense_month_id uuid unique;
alter table public.financial_transactions add constraint financial_transactions_user_id_id_key unique(user_id,id);
alter table public.financial_transactions add constraint financial_transactions_owner_bill_fkey
  foreign key(user_id,fixed_expense_month_id) references public.fixed_expense_months(user_id,id);
alter table public.fixed_expense_months add constraint fixed_expense_months_owner_transaction_fkey
  foreign key(user_id,financial_transaction_id) references public.financial_transactions(user_id,id);
create index fixed_expense_months_owner_reference_idx on public.fixed_expense_months(user_id,reference_month,due_day,id);
create index fixed_expenses_owner_idx on public.fixed_expenses(user_id,id);
create trigger guard_fixed_expense before insert or update on public.fixed_expenses
  for each row execute function routine_private.guard_financial_transaction();
create trigger guard_fixed_expense_month before insert or update on public.fixed_expense_months
  for each row execute function routine_private.guard_financial_transaction();
alter table public.fixed_expenses enable row level security;
alter table public.fixed_expense_months enable row level security;
create policy fixed_expenses_select on public.fixed_expenses for select to authenticated using(user_id=(select auth.uid()));
create policy fixed_expense_months_select on public.fixed_expense_months for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.fixed_expenses,public.fixed_expense_months from public,anon,authenticated;
grant select on public.fixed_expenses,public.fixed_expense_months to authenticated;
-- Manual entries remain editable. Generated entries can only change through the bill operation.
drop policy financial_transactions_update on public.financial_transactions;
create policy financial_transactions_update on public.financial_transactions for update to authenticated
  using(user_id=(select auth.uid()) and fixed_expense_month_id is null)
  with check(user_id=(select auth.uid()) and fixed_expense_month_id is null);
drop policy financial_transactions_insert on public.financial_transactions;
create policy financial_transactions_insert on public.financial_transactions for insert to authenticated
  with check(user_id=(select auth.uid()) and fixed_expense_month_id is null);

create function routine_private.bill_reference_month(p_today date) returns date
language sql immutable set search_path=pg_catalog as $$
  select (date_trunc('month',p_today) - case when extract(day from p_today)<20 then interval '1 month' else interval '0 month' end)::date
$$;
revoke all on function routine_private.bill_reference_month(date) from public,anon,authenticated;

create function public.save_fixed_expense(p_id uuid,p_name text,p_default_amount_cents integer,p_due_day integer,p_category text,p_active boolean,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  actor uuid := auth.uid();
  current_ref date := routine_private.bill_reference_month((clock_timestamp() at time zone 'America/Sao_Paulo')::date);
  v public.fixed_expenses;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 200
    or p_default_amount_cents is null or p_default_amount_cents<=0 or p_due_day is null or p_due_day not between 1 and 31
    or p_category is null or char_length(btrim(p_category)) not between 1 and 100 or p_active is null then
    raise exception 'Invalid bill' using errcode='22023';
  end if;
  if p_expected_updated_at is null then
    insert into public.fixed_expenses(id,user_id,name,default_amount_cents,due_day,category,active,starts_on)
      values(p_id,actor,btrim(p_name),p_default_amount_cents,p_due_day,btrim(p_category),p_active,current_ref)
      on conflict(id) do nothing;
  end if;
  select * into v from public.fixed_expenses where id=p_id and user_id=actor for update;
  if not found then raise exception 'Bill unavailable' using errcode='PT404'; end if;
  if (v.name,v.default_amount_cents,v.due_day,v.category,v.active) is distinct from
    (btrim(p_name),p_default_amount_cents,p_due_day,btrim(p_category),p_active) then
    if p_expected_updated_at is null or v.updated_at<>p_expected_updated_at then
      raise exception 'Stale bill' using errcode='PT409';
    end if;
    update public.fixed_expenses set name=btrim(p_name),default_amount_cents=p_default_amount_cents,due_day=p_due_day,category=btrim(p_category),active=p_active
      where id=v.id and user_id=actor returning * into v;
  end if;
  -- New accounts appear in the current financial month; existing snapshots never change.
  if v.active then
    insert into public.fixed_expense_months(user_id,fixed_expense_id,reference_month,name,due_day,category,amount_cents)
      values(actor,v.id,current_ref,v.name,v.due_day,v.category,v.default_amount_cents)
      on conflict(user_id,fixed_expense_id,reference_month) do nothing;
  end if;
  return to_jsonb(v);
end $$;

create function public.initialize_fixed_expense_month(p_reference_month date) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid := auth.uid(); v public.fixed_expenses; inserted integer; total integer:=0;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_reference_month is null or p_reference_month not between date '0001-01-01' and date '9999-12-01' or extract(day from p_reference_month)<>1 then
    raise exception 'Invalid month' using errcode='22023';
  end if;
  -- Same lock order for concurrent initialization, edits and deactivation.
  for v in select * from public.fixed_expenses where user_id=actor and active and starts_on<=p_reference_month order by id for update loop
    insert into public.fixed_expense_months(user_id,fixed_expense_id,reference_month,name,due_day,category,amount_cents)
      values(actor,v.id,p_reference_month,v.name,v.due_day,v.category,v.default_amount_cents)
      on conflict(user_id,fixed_expense_id,reference_month) do nothing;
    get diagnostics inserted = row_count; total:=total+inserted;
  end loop;
  return total;
end $$;

create function public.save_fixed_expense_month(p_id uuid,p_amount_cents integer,p_paid boolean,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); v public.fixed_expense_months; tx_id uuid; changed integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_id is null or p_amount_cents is null or p_amount_cents<=0 or p_paid is null or p_expected_updated_at is null then
    raise exception 'Invalid payment' using errcode='22023';
  end if;
  select * into v from public.fixed_expense_months where id=p_id and user_id=actor for update;
  if not found then raise exception 'Payment unavailable' using errcode='PT404'; end if;
  -- Explicit desired state makes response-loss retries and duplicate clicks idempotent.
  if v.amount_cents=p_amount_cents and (v.paid_at is not null)=p_paid then return to_jsonb(v); end if;
  if v.updated_at<>p_expected_updated_at then raise exception 'Stale payment' using errcode='PT409'; end if;
  tx_id:=v.financial_transaction_id;
  if p_paid then
    if tx_id is null then
      tx_id:=gen_random_uuid();
      insert into public.financial_transactions(id,user_id,type,date,amount_cents,description,category,fixed_expense_month_id)
        values(tx_id,actor,'expense',(clock_timestamp() at time zone 'America/Sao_Paulo')::date,p_amount_cents,
          v.name||' — '||to_char(v.reference_month,'MM/YYYY'),v.category,v.id);
    else
      update public.financial_transactions set amount_cents=p_amount_cents
        where id=tx_id and user_id=actor and fixed_expense_month_id=v.id and type='expense';
      get diagnostics changed = row_count;
      if changed<>1 then raise exception 'Inconsistent payment' using errcode='23514'; end if;
    end if;
    update public.fixed_expense_months set amount_cents=p_amount_cents,paid_at=coalesce(v.paid_at,clock_timestamp()),financial_transaction_id=tx_id
      where id=v.id and user_id=actor returning * into v;
  else
    update public.fixed_expense_months set amount_cents=p_amount_cents,paid_at=null,financial_transaction_id=null
      where id=v.id and user_id=actor returning * into v;
    if tx_id is not null then
      delete from public.financial_transactions where id=tx_id and user_id=actor and fixed_expense_month_id=v.id and type='expense';
      get diagnostics changed = row_count;
      if changed<>1 then raise exception 'Inconsistent payment' using errcode='23514'; end if;
    end if;
  end if;
  return to_jsonb(v);
end $$;
revoke all on function public.save_fixed_expense(uuid,text,integer,integer,text,boolean,timestamptz),
  public.initialize_fixed_expense_month(date),public.save_fixed_expense_month(uuid,integer,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.save_fixed_expense(uuid,text,integer,integer,text,boolean,timestamptz),
  public.initialize_fixed_expense_month(date),public.save_fixed_expense_month(uuid,integer,boolean,timestamptz) to authenticated;
