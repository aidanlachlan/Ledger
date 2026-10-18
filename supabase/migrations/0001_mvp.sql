create table public.profiles (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now()
);

create table public.food_budgets (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  grocery_weekly_cents integer not null default 15000
    check (grocery_weekly_cents between 0 and 1000000),
  meals_out_weekly integer not null default 1
    check (meals_out_weekly between 0 and 100)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  request_id uuid not null,
  store_name text not null
    check (char_length(btrim(store_name)) between 1 and 120),
  purchased_on date not null,
  type text not null check (type in ('groceries', 'eating_out', 'convenience')),
  subtotal_cents integer check (subtotal_cents between 0 and 1000000),
  savings_cents integer not null default 0
    check (savings_cents between 0 and 1000000),
  tax_cents integer check (tax_cents between 0 and 1000000),
  total_cents integer not null check (total_cents between 0 and 1000000),
  source text not null check (source in ('paste', 'manual')),
  math_check text not null default 'skipped'
    check (math_check in ('ok', 'mismatch', 'skipped')),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index purchases_user_date
  on public.purchases(user_id, purchased_on desc, created_at desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  position integer not null check (position between 0 and 199),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  -- Unconstrained numeric plus CHECK prevents direct SQL from rounding 1.0004.
  quantity numeric not null default 1
    check (quantity > 0 and quantity <= 10000
      and quantity * 1000 = trunc(quantity * 1000)),
  unit_price_cents integer check (unit_price_cents between 0 and 1000000),
  line_total_cents integer not null check (line_total_cents between 0 and 1000000),
  savings_cents integer not null default 0
    check (savings_cents between 0 and 1000000),
  unique (purchase_id, position)
);

alter table public.profiles enable row level security;
alter table public.food_budgets enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy own_rows on public.profiles for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_rows on public.food_budgets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_rows on public.purchases for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_rows on public.purchase_items for all to authenticated
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_items.purchase_id
      and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.purchases p
    where p.id = purchase_items.purchase_id
      and p.user_id = (select auth.uid())
  ));

-- Explicit API privileges. RLS still restricts authenticated users to owned rows.
revoke all on public.profiles, public.food_budgets,
  public.purchases, public.purchase_items from public, anon;
grant select, insert, update, delete on public.profiles, public.food_budgets,
  public.purchases, public.purchase_items to authenticated;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.food_budgets (user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Validate even direct profile updates, so timezone-dependent writes cannot break.
create function public.validate_timezone() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_timezone() from public, anon, authenticated;
create trigger profiles_timezone_check before insert or update of timezone
  on public.profiles for each row execute function public.validate_timezone();

create function public.save_purchase(p_payload jsonb, p_request_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  purchase_id uuid;
  payload_item jsonb;
  item_index integer := 0;
  item_sum bigint := 0;
  receipt_savings integer;
  receipt_tax integer;
  receipt_total integer;
  receipt_subtotal integer;
  result_math text := 'skipped';
  field text;
  amount numeric;
  quantity_value numeric;
  purchase_date date;
  user_timezone text;
begin
  if owner_id is null or p_request_id is null then raise exception 'Authentication and request ID required'; end if;
  -- Serialize only retries for this user/request, including concurrent submissions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':' || p_request_id::text, 0));
  select id into purchase_id from public.purchases
    where user_id = owner_id and request_id = p_request_id;
  if purchase_id is not null then return purchase_id; end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
    or not (p_payload ?& array['storeName','purchasedOn','type','source','subtotalCents','savingsCents','taxCents','totalCents','note','items'])
    or (p_payload - array['storeName','purchasedOn','type','source','subtotalCents','savingsCents','taxCents','totalCents','note','items']) <> '{}'::jsonb then
    raise exception 'Invalid purchase fields';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'storeName') <> 'string'
    or pg_catalog.char_length(pg_catalog.btrim(p_payload->>'storeName')) not between 1 and 120
    or pg_catalog.jsonb_typeof(p_payload->'purchasedOn') <> 'string'
    or (p_payload->>'purchasedOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or pg_catalog.jsonb_typeof(p_payload->'type') <> 'string'
    or (p_payload->>'type') not in ('groceries','eating_out','convenience')
    or pg_catalog.jsonb_typeof(p_payload->'source') <> 'string'
    or (p_payload->>'source') not in ('manual','paste') then
    raise exception 'Invalid purchase details';
  end if;
  if pg_catalog.jsonb_typeof(p_payload->'note') not in ('string','null')
    or pg_catalog.char_length(p_payload->>'note') > 1000 then raise exception 'Invalid note'; end if;
  select timezone into user_timezone from public.profiles where user_id = owner_id;
  if user_timezone is null then raise exception 'Profile required'; end if;
  purchase_date := (p_payload->>'purchasedOn')::date;
  if pg_catalog.to_char(purchase_date,'YYYY-MM-DD') <> p_payload->>'purchasedOn'
    or purchase_date > (pg_catalog.now() at time zone user_timezone)::date then
    raise exception 'Invalid purchase date';
  end if;
  foreach field in array array['subtotalCents','savingsCents','taxCents','totalCents'] loop
    if pg_catalog.jsonb_typeof(p_payload->field) = 'null' and field in ('subtotalCents','taxCents') then continue; end if;
    if pg_catalog.jsonb_typeof(p_payload->field) <> 'number' then raise exception 'Invalid money'; end if;
    amount := (p_payload->>field)::numeric;
    if amount < 0 or amount > 1000000 or amount <> pg_catalog.trunc(amount) then raise exception 'Invalid money'; end if;
  end loop;
  receipt_subtotal := (p_payload->>'subtotalCents')::numeric::integer;
  receipt_savings := (p_payload->>'savingsCents')::numeric::integer;
  receipt_tax := (p_payload->>'taxCents')::numeric::integer;
  receipt_total := (p_payload->>'totalCents')::numeric::integer;
  if pg_catalog.jsonb_typeof(p_payload->'items') <> 'array' then raise exception 'Invalid items'; end if;
  if pg_catalog.jsonb_array_length(p_payload->'items') > 200 then raise exception 'Too many items'; end if;
  if p_payload->>'source' = 'manual' and (
    pg_catalog.jsonb_array_length(p_payload->'items') <> 0 or receipt_subtotal is not null
    or receipt_tax is not null or receipt_savings <> 0
  ) then raise exception 'Manual purchase cannot contain receipt details'; end if;

  -- Validate all items before inserting; any later SQL failure also rolls back.
  for payload_item in select value from pg_catalog.jsonb_array_elements(p_payload->'items') loop
    if pg_catalog.jsonb_typeof(payload_item) <> 'object'
      or not (payload_item ?& array['name','quantity','unitPriceCents','lineTotalCents','savingsCents'])
      or (payload_item - array['name','quantity','unitPriceCents','lineTotalCents','savingsCents']) <> '{}'::jsonb then raise exception 'Invalid item fields'; end if;
    if pg_catalog.jsonb_typeof(payload_item->'name') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(payload_item->>'name')) not between 1 and 200
      or pg_catalog.jsonb_typeof(payload_item->'quantity') <> 'number' then raise exception 'Invalid item details'; end if;
    quantity_value := (payload_item->>'quantity')::numeric;
    if quantity_value <= 0 or quantity_value > 10000 or pg_catalog.scale(quantity_value) > 3 then raise exception 'Invalid quantity'; end if;
    foreach field in array array['unitPriceCents','lineTotalCents','savingsCents'] loop
      if pg_catalog.jsonb_typeof(payload_item->field) = 'null' and field = 'unitPriceCents' then continue; end if;
      if pg_catalog.jsonb_typeof(payload_item->field) <> 'number' then raise exception 'Invalid item money'; end if;
      amount := (payload_item->>field)::numeric;
      if amount < 0 or amount > 1000000 or amount <> pg_catalog.trunc(amount) then raise exception 'Invalid item money'; end if;
    end loop;
    item_sum := item_sum + (payload_item->>'lineTotalCents')::numeric::integer;
  end loop;
  if pg_catalog.jsonb_array_length(p_payload->'items') > 0 and receipt_tax is not null then
    result_math := case when pg_catalog.abs(item_sum + receipt_tax - receipt_total) <= 2
      or pg_catalog.abs(item_sum - receipt_savings + receipt_tax - receipt_total) <= 2
      then 'ok' else 'mismatch' end;
  end if;
  insert into public.purchases (request_id, store_name, purchased_on, type, subtotal_cents,
    savings_cents, tax_cents, total_cents, source, math_check, note)
  values (p_request_id, p_payload->>'storeName', purchase_date, p_payload->>'type',
    receipt_subtotal, receipt_savings, receipt_tax, receipt_total, p_payload->>'source', result_math,
    p_payload->>'note') returning id into purchase_id;
  for payload_item in select value from pg_catalog.jsonb_array_elements(p_payload->'items') loop
    insert into public.purchase_items (purchase_id, position, name, quantity, unit_price_cents, line_total_cents, savings_cents)
    values (purchase_id, item_index, payload_item->>'name', (payload_item->>'quantity')::numeric,
      (payload_item->>'unitPriceCents')::numeric::integer, (payload_item->>'lineTotalCents')::numeric::integer,
      (payload_item->>'savingsCents')::numeric::integer);
    item_index := item_index + 1;
  end loop;
  return purchase_id;
end;
$$;
revoke all on function public.save_purchase(jsonb,uuid) from public, anon;
grant execute on function public.save_purchase(jsonb,uuid) to authenticated;
