\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

do $$
begin
  if (select count(*) from pg_catalog.pg_tables
      where schemaname = 'public') <> 5 then
    raise exception 'Migrations must create exactly five public tables';
  end if;
  if (select count(*) from public.profiles) <> 2
    or (select count(*) from public.food_budgets) <> 2 then
    raise exception 'Auth trigger did not create both settings rows';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
declare
  payload jsonb;
  saved_id uuid;
  rejected boolean;
  bad jsonb;
  v_today text := to_char((now() at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD');
begin
  if (select count(*) from public.profiles) <> 1
    or (select count(*) from public.food_budgets) <> 1
    or (select grocery_weekly_cents from public.food_budgets) <> 15000 then
    raise exception 'A cannot see its initialized settings correctly';
  end if;

  payload := jsonb_build_object(
    'storeName', 'A Shop', 'purchasedOn', v_today,
    'type', 'groceries', 'subtotalCents', null,
    'savingsCents', 0, 'taxCents', null, 'totalCents', 2450,
    'source', 'manual', 'note', null, 'items', '[]'::jsonb
  );
  saved_id := public.save_purchase(payload, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
  if saved_id is null or
    (select math_check from public.purchases where id = saved_id) <> 'skipped' then
    raise exception 'Manual save failed';
  end if;
  if public.save_purchase(jsonb_set(payload, '{storeName}', '"Changed"'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) <> saved_id
    or (select store_name from public.purchases where id = saved_id) <> 'A Shop' then
    raise exception 'Retry overwrote the original';
  end if;

  payload := jsonb_build_object(
    'storeName', 'A Receipt', 'purchasedOn', v_today,
    'type', 'convenience', 'subtotalCents', 800,
    'savingsCents', 100, 'taxCents', 50, 'totalCents', 750,
    'source', 'paste', 'note', 'reviewed',
    'items', jsonb_build_array(
      jsonb_build_object('name', 'Milk', 'quantity', 1.25,
        'unitPriceCents', null, 'lineTotalCents', 500, 'savingsCents', 100),
      jsonb_build_object('name', 'Bread', 'quantity', 1,
        'unitPriceCents', 300, 'lineTotalCents', 200, 'savingsCents', 0)
    )
  );
  saved_id := public.save_purchase(payload, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
  if (select math_check from public.purchases where id = saved_id) <> 'ok'
    or (select count(*) from public.purchase_items where purchase_id = saved_id) <> 2
    or (select quantity from public.purchase_items
        where purchase_id = saved_id and position = 0) <> 1.25 then
    raise exception 'Receipt save or math check failed';
  end if;
  if public.save_purchase(jsonb_set(payload, '{items}', '[]'::jsonb),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) <> saved_id
    or (select count(*) from public.purchase_items where purchase_id = saved_id) <> 2 then
    raise exception 'Receipt retry modified items';
  end if;

  -- Missing tax skips math; an explicit zero tax checks math.
  saved_id := public.save_purchase(
    jsonb_set(payload, '{taxCents}', 'null'::jsonb), gen_random_uuid());
  if (select math_check from public.purchases where id = saved_id) <> 'skipped' then
    raise exception 'Unknown tax did not skip math';
  end if;
  saved_id := public.save_purchase(
    jsonb_set(payload, '{totalCents}', '500'::jsonb), gen_random_uuid());
  if (select math_check from public.purchases where id = saved_id) <> 'mismatch' then
    raise exception 'Inconsistent receipt should warn';
  end if;
  saved_id := public.save_purchase(
    jsonb_set(jsonb_set(payload, '{taxCents}', '0'::jsonb),
      '{totalCents}', '700'::jsonb), gen_random_uuid());
  if (select math_check from public.purchases where id = saved_id) <> 'ok' then
    raise exception 'Explicit zero tax should check math';
  end if;
  saved_id := public.save_purchase(
    jsonb_set(payload, '{items}', '[]'::jsonb), gen_random_uuid());
  if (select math_check from public.purchases where id = saved_id) <> 'skipped' then
    raise exception 'Zero-item receipt should be valid and skipped';
  end if;

  -- These are direct RPC inputs, deliberately bypassing Zod. Failed attempts
  -- must leave neither parent nor partial items behind.
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(payload, '{items,0,quantity}', '1.1234'),
    jsonb_set(payload, '{items,0,quantity}', '0'),
    jsonb_set(payload, '{items,0,quantity}', '10000.001'),
    jsonb_set(payload, '{items,0,quantity}', '"1"'),
    jsonb_set(payload, '{items,0,name}', '"   "'),
    jsonb_set(payload, '{items,0,name}', to_jsonb(repeat('x', 201))),
    jsonb_set(payload, '{items,0,lineTotalCents}', '1.5'),
    jsonb_set(payload, '{items,0,lineTotalCents}', '-1'),
    jsonb_set(payload, '{items,0,savingsCents}', '1000001'),
    jsonb_set(payload, '{items,0,unitPriceCents}', '"200"'),
    jsonb_set(payload, '{items,0,rawName}', '"private"'),
    jsonb_set(payload, '{items,1}', 'null'),
    jsonb_set(payload, '{storeName}', '""'),
    jsonb_set(payload, '{storeName}', to_jsonb(repeat('x', 121))),
    jsonb_set(payload, '{note}', to_jsonb(repeat('x', 1001))),
    jsonb_set(payload, '{totalCents}', '1.5'),
    jsonb_set(payload, '{totalCents}', 'null'),
    jsonb_set(payload, '{totalCents}', '"750"'),
    jsonb_set(payload, '{savingsCents}', '-1'),
    jsonb_set(payload, '{taxCents}', '1000001'),
    jsonb_set(payload, '{type}', '"other"'),
    jsonb_set(payload, '{source}', '"photo"'),
    jsonb_set(payload, '{purchasedOn}', '"2026-02-30"'),
    jsonb_set(payload, '{purchasedOn}', '"2026-2-2"'),
    jsonb_set(payload, '{purchasedOn}', to_jsonb((current_date + 5)::text)),
    jsonb_set(payload, '{items}', '"wrong"'),
    jsonb_set(payload, '{items}', (
      select jsonb_agg(payload->'items'->0) from generate_series(1, 201)
    )),
    jsonb_set(payload, '{user_id}', '"22222222-2222-4222-8222-222222222222"'),
    payload - 'subtotalCents',
    jsonb_set(payload, '{mathCheck}', '"ok"'),
    jsonb_set(payload, '{note}', '123')
  )) loop
    rejected := false;
    begin
      perform public.save_purchase(bad, gen_random_uuid());
    exception when others then
      rejected := true;
    end;
    if not rejected then
      raise exception 'Invalid RPC payload was accepted: %', left(bad::text, 120);
    end if;
  end loop;
  rejected := false;
  begin
    perform public.save_purchase(payload, null);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Null request UUID was accepted'; end if;

  -- Manual purchases cannot carry receipt totals (subtotal, tax, savings).
  rejected := false;
  begin
    perform public.save_purchase(jsonb_set(payload, '{source}', '"manual"'), gen_random_uuid());
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Manual purchase accepted receipt totals'; end if;

  if (select count(*) from public.purchases) <> 6
    or (select count(*) from public.purchase_items) <> 8 then
    raise exception 'Invalid RPC calls persisted data: purchases %, items %',
      (select count(*) from public.purchases),
      (select count(*) from public.purchase_items);
  end if;
end;
$$;

-- Direct table writes must not round quantities and must respect ownership.
do $$
declare
  receipt_id uuid := (select id from public.purchases
    where request_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  rejected boolean := false;
begin
  begin
    insert into public.purchase_items (
      purchase_id, position, name, quantity, line_total_cents
    ) values (receipt_id, 18, 'Too precise', 1.2345, 100);
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Direct SQL silently rounded quantity'; end if;
  if exists (select 1 from public.purchase_items
      where purchase_id = receipt_id and position = 18) then
    raise exception 'Rejected direct insert left an item';
  end if;
  rejected := false;
  begin
    update public.profiles set timezone = 'Not/A_Real_IANA_Zone';
  exception when others then rejected := true;
  end;
  if not rejected or (select timezone from public.profiles) <> 'America/Los_Angeles' then
    raise exception 'Direct invalid timezone was accepted';
  end if;
end;
$$;

-- Verify the timezone check uses the saved timezone, not UTC or server time.
update public.profiles set timezone = 'Pacific/Kiritimati';
do $$
declare
  payload jsonb := jsonb_build_object(
    'storeName', 'Date Test', 'purchasedOn',
      to_char((now() at time zone 'Pacific/Kiritimati')::date, 'YYYY-MM-DD'),
    'type', 'groceries', 'subtotalCents', null, 'savingsCents', 0,
    'taxCents', null, 'totalCents', 100, 'source', 'manual',
    'note', null, 'items', '[]'::jsonb
  );
  rejected boolean := false;
begin
  perform public.save_purchase(payload, gen_random_uuid());
  begin
    perform public.save_purchase(jsonb_set(payload, '{purchasedOn}',
      to_jsonb(to_char((now() at time zone 'Pacific/Kiritimati')::date + 1,
        'YYYY-MM-DD'))), gen_random_uuid());
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Future local date accepted'; end if;
end;
$$;

-- Check that a failure on the second INSERT also rolls back the parent and
-- first item (not just validation before INSERT).
reset role;
create function public.test_reject_second_item() returns trigger
language plpgsql as $$
begin
  if new.name = 'ROLLBACK_MARKER' then
    raise exception 'Injected insert failure';
  end if;
  return new;
end;
$$;
create trigger test_reject_item before insert on public.purchase_items
  for each row execute function public.test_reject_second_item();
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  before_count integer := (select count(*) from public.purchases);
  before_items integer := (select count(*) from public.purchase_items);
  rejected boolean := false;
begin
  begin
    perform public.save_purchase(jsonb_build_object(
      'storeName', 'Failing Receipt', 'purchasedOn',
      to_char((now() at time zone 'Pacific/Kiritimati')::date, 'YYYY-MM-DD'),
      'type', 'groceries', 'subtotalCents', null, 'savingsCents', 0,
      'taxCents', 0, 'totalCents', 300, 'source', 'paste', 'note', null,
      'items', jsonb_build_array(
        jsonb_build_object('name', 'Valid first', 'quantity', 1,
          'unitPriceCents', null, 'lineTotalCents', 100, 'savingsCents', 0),
        jsonb_build_object('name', 'ROLLBACK_MARKER', 'quantity', 1,
          'unitPriceCents', null, 'lineTotalCents', 200, 'savingsCents', 0)
      )
    ), gen_random_uuid());
  exception when others then rejected := true;
  end;
  if not rejected or (select count(*) from public.purchases) <> before_count
    or (select count(*) from public.purchase_items) <> before_items then
    raise exception 'An item insert failure did not roll back the save';
  end if;
end;
$$;
reset role;
drop trigger test_reject_item on public.purchase_items;
drop function public.test_reject_second_item();

-- User B can see only B's records, even when the A UUIDs are known.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare
  a_purchase uuid := (select id from public.purchases limit 1);
  b_purchase uuid;
  rejected boolean := false;
  b_item uuid;
begin
  -- RLS makes the A-side query above return NULL.
  if a_purchase is not null
    or (select count(*) from public.profiles) <> 1
    or (select count(*) from public.food_budgets) <> 1
    or (select count(*) from public.purchases) <> 0
    or (select count(*) from public.purchase_items) <> 0
    or exists (select 1 from public.purchases where store_name like 'A%') then
    raise exception 'User B saw User A records or autocomplete';
  end if;
  a_purchase := (select id from public.purchases
    where request_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  if a_purchase is not null then raise exception 'A purchase leaked'; end if;
  -- Use a literal known request UUID, since SELECT must not reveal A's ID.
  begin
    insert into public.purchase_items (
      purchase_id, position, name, quantity, line_total_cents
    ) values ('33333333-3333-4333-8333-333333333333', 0, 'Injected', 1, 100);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Insert into unowned parent succeeded'; end if;

  rejected := false;
  begin
    insert into public.purchases (
      user_id, request_id, store_name, purchased_on, type, total_cents, source
    ) values ('11111111-1111-4111-8111-111111111111', gen_random_uuid(),
      'Forged purchase', current_date, 'groceries', 100, 'manual');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'B inserted purchase claiming A ownership'; end if;

  b_purchase := public.save_purchase(jsonb_build_object(
    'storeName', 'B Shop', 'purchasedOn',
      to_char((now() at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD'),
    'type', 'groceries', 'subtotalCents', 200, 'savingsCents', 0,
    'taxCents', 0, 'totalCents', 200, 'source', 'paste', 'note', null,
    'items', jsonb_build_array(jsonb_build_object(
      'name', 'B item', 'quantity', 1, 'unitPriceCents', 200,
      'lineTotalCents', 200, 'savingsCents', 0
    ))
  ), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
  select id into b_item from public.purchase_items where purchase_id = b_purchase;
  if b_item is null then raise exception 'User B cannot save own item'; end if;
end;
$$;

-- Use actual A UUIDs as a hostile B; expose IDs only through the test harness,
-- not through B's SELECT privileges.
reset role;
create table pg_temp.test_ids as
select (select id from public.purchases where request_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  and user_id = '11111111-1111-4111-8111-111111111111') as a_purchase,
  (select id from public.purchase_items where purchase_id = (
    select id from public.purchases where request_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and user_id = '11111111-1111-4111-8111-111111111111') limit 1) as a_item;
grant select on pg_temp.test_ids to authenticated;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare
  a_purchase uuid := (select t.a_purchase from pg_temp.test_ids t);
  a_item uuid := (select t.a_item from pg_temp.test_ids t);
  b_item uuid := (select i.id from public.purchase_items i limit 1);
  rejected boolean := false;
begin
  if a_purchase is null or a_item is null or b_item is null then
    raise exception 'Test fixture missing purchase/item';
  end if;
  if exists (select 1 from public.purchases where id = a_purchase)
    or exists (select 1 from public.purchase_items where id = a_item) then
    raise exception 'Known A IDs leaked through SELECT';
  end if;
  update public.purchase_items set name = 'Hacked' where id = a_item;
  if found then raise exception 'B updated A item'; end if;
  delete from public.purchase_items where id = a_item;
  if found then raise exception 'B deleted A item'; end if;
  update public.purchases set store_name = 'Hacked' where id = a_purchase;
  if found then raise exception 'B updated A purchase'; end if;
  delete from public.purchases where id = a_purchase;
  if found then raise exception 'B deleted A purchase'; end if;
  begin
    insert into public.purchase_items (
      purchase_id, position, name, quantity, line_total_cents
    ) values (a_purchase, 9, 'Hacked', 1, 100);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'B inserted under A purchase'; end if;
  rejected := false;
  begin
    update public.purchase_items set purchase_id = a_purchase where id = b_item;
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'B reparented item to A'; end if;
  if (select purchase_id from public.purchase_items where id = b_item) = a_purchase then
    raise exception 'B reparent persisted';
  end if;
end;
$$;

-- Authenticated role without a verified auth.uid() must not see or save data.
reset request.jwt.claim.sub;
do $$
declare
  rejected boolean := false;
begin
  if exists (select 1 from public.profiles)
    or exists (select 1 from public.food_budgets)
    or exists (select 1 from public.purchases)
    or exists (select 1 from public.purchase_items) then
    raise exception 'Unauthenticated JWT claim read data';
  end if;
  begin
    perform public.save_purchase('{}'::jsonb, gen_random_uuid());
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Missing auth.uid() saved data'; end if;
end;
$$;

reset role;
set role anon;
do $$
declare
  rejected boolean := false;
  table_name text;
  row_count integer;
begin
  foreach table_name in array array[
    'profiles', 'food_budgets', 'purchases', 'purchase_items', 'budget_history'
  ] loop
    rejected := false;
    begin
      execute format('select count(*) from public.%I', table_name) into row_count;
    exception when insufficient_privilege then rejected := true;
    end;
    if not rejected then raise exception 'Anon can read %', table_name; end if;
    if has_table_privilege('anon', format('public.%I', table_name),
      'INSERT, UPDATE, DELETE') then
      raise exception 'Anon can mutate %', table_name;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.save_purchase(jsonb,uuid)', 'EXECUTE') then
    raise exception 'Anon can execute save_purchase';
  end if;
end;
$$;

reset role;
do $$
begin
  if (select count(*) from public.purchases
      where user_id = '11111111-1111-4111-8111-111111111111') <> 7
    or (select count(*) from public.purchases
      where user_id = '22222222-2222-4222-8222-222222222222') <> 1 then
    raise exception 'Isolation/rollback test changed purchase counts';
  end if;
end;
$$;
select 'MVP SQL verification passed' as result;
