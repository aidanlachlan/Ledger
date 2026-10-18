#!/usr/bin/env bash
# Disposable PostgreSQL test cluster: no Supabase keys or existing DB required.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/ledger-sql.XXXXXX")"
started=0
cleanup() {
  if [[ "$started" == 1 ]]; then
    pg_ctl -D "$work/data" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

initdb -D "$work/data" --auth-local=trust --auth-host=reject --no-instructions >"$work/init.log"
# UNIX socket only, contained in an inaccessible-to-others temp directory.
pg_ctl -D "$work/data" -l "$work/postgres.log" \
  -o "-h '' -k $work -p 55439" -w start >"$work/start.log"
started=1
export PGHOST="$work" PGPORT=55439 PGUSER="$(id -un)" PGDATABASE=postgres

psql -X -v ON_ERROR_STOP=1 -q -f "$here/stub_auth.sql"
for migration in "$here"/../migrations/*.sql; do
  psql -X -v ON_ERROR_STOP=1 -q -f "$migration"
done
psql -X -v ON_ERROR_STOP=1 -q -f "$here/verify_mvp.sql"

# The first transaction retains the unique-key lock while the second RPC
# starts. They must both resolve to the same purchase UUID.
payload="jsonb_build_object(
  'storeName', 'Concurrent Shop',
  'purchasedOn', to_char((now() at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD'),
  'type', 'groceries', 'subtotalCents', 300, 'savingsCents', 0,
  'taxCents', 0, 'totalCents', 300, 'source', 'paste', 'note', null,
  'items', jsonb_build_array(
    jsonb_build_object('name', 'One', 'quantity', 1,
      'unitPriceCents', null, 'lineTotalCents', 100, 'savingsCents', 0),
    jsonb_build_object('name', 'Two', 'quantity', 1,
      'unitPriceCents', null, 'lineTotalCents', 200, 'savingsCents', 0)
  )
)"
call="select public.save_purchase($payload, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');"
psql -X -v ON_ERROR_STOP=1 -qAt -f - >"$work/first.result" <<SQL &
  begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  $call
  select pg_sleep(2);
  commit;
SQL
first_pid=$!
sleep 0.3
psql -X -v ON_ERROR_STOP=1 -qAt -c "
  set role authenticated;
  set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  $call
" >"$work/second.result" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"

first_id="$(grep -E '^[0-9a-f]{8}-[0-9a-f-]{27,}$' "$work/first.result" | head -1)"
second_id="$(grep -E '^[0-9a-f]{8}-[0-9a-f-]{27,}$' "$work/second.result" | head -1)"
if [[ -z "$first_id" || "$first_id" != "$second_id" ]]; then
  echo 'Concurrent RPCs returned different IDs' >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -q -c "
  do \$\$
  begin
    if (select count(*) from public.purchases
        where user_id = '11111111-1111-4111-8111-111111111111'
          and request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 1
       or (select count(*) from public.purchase_items
         where purchase_id = '$first_id') <> 2 then
      raise exception 'Concurrent retry created duplicate purchase/items';
    end if;
  end;
  \$\$;
"
echo 'Concurrent UUID idempotence passed (one purchase, two items)'

# Manual purchases may list items; receipt totals stay paste-only.
psql -X -v ON_ERROR_STOP=1 -q -c "
  set role authenticated;
  set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  do \$\$
  declare
    payload jsonb := jsonb_build_object(
      'storeName', 'Manual Items Shop',
      'purchasedOn', to_char((now() at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD'),
      'type', 'groceries', 'subtotalCents', null, 'savingsCents', 0,
      'taxCents', null, 'totalCents', 450, 'source', 'manual', 'note', null,
      'items', jsonb_build_array(
        jsonb_build_object('name', 'Apples', 'quantity', 3,
          'unitPriceCents', null, 'lineTotalCents', 300, 'savingsCents', 0),
        jsonb_build_object('name', 'Bread', 'quantity', 1,
          'unitPriceCents', null, 'lineTotalCents', 150, 'savingsCents', 0)
      )
    );
    saved_id uuid;
    rejected boolean := false;
  begin
    saved_id := public.save_purchase(payload, gen_random_uuid());
    if (select count(*) from public.purchase_items where purchase_id = saved_id) <> 2
      or (select math_check from public.purchases where id = saved_id) <> 'skipped' then
      raise exception 'Manual purchase with items was not saved correctly';
    end if;
    begin
      perform public.save_purchase(jsonb_set(payload, '{taxCents}', '10'), gen_random_uuid());
    exception when others then rejected := true;
    end;
    if not rejected then raise exception 'Manual purchase accepted receipt tax'; end if;
  end;
  \$\$;
"
echo 'Manual purchase items passed'

# Editing keeps the purchase's id and source and replaces its items atomically;
# another user can neither edit nor delete it; deleting removes its items.
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
create temp table edit_target as
  select id, request_id, created_at from public.purchases
  where store_name = 'Manual Items Shop';
do $$
declare
  target uuid := (select id from edit_target);
  payload jsonb := jsonb_build_object(
    'storeName', 'Edited Shop',
    'purchasedOn', to_char((now() at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD'),
    'type', 'convenience', 'subtotalCents', null, 'savingsCents', 0,
    'taxCents', null, 'totalCents', 999, 'source', 'paste', 'note', 'edited',
    'items', jsonb_build_array(
      jsonb_build_object('name', 'Only', 'quantity', 1,
        'unitPriceCents', null, 'lineTotalCents', 999, 'savingsCents', 0)
    )
  );
  before_total integer := (select count(*) from public.purchases);
  rejected boolean := false;
begin
  if public.update_purchase(target, payload) <> target then
    raise exception 'Update returned a different id';
  end if;
  if (select count(*) from public.purchases) <> before_total
    or (select store_name || total_cents || source from public.purchases where id = target)
      <> 'Edited Shop999manual'
    or (select request_id from public.purchases where id = target)
      <> (select request_id from edit_target)
    or (select created_at from public.purchases where id = target)
      <> (select created_at from edit_target)
    or (select string_agg(name, ',' order by position) from public.purchase_items
        where purchase_id = target) <> 'Only' then
    raise exception 'Update did not replace the purchase in place';
  end if;
  begin
    perform public.update_purchase(target, jsonb_set(payload, '{taxCents}', '5'));
  exception when others then rejected := true;
  end;
  if not rejected or (select total_cents from public.purchases where id = target) <> 999 then
    raise exception 'Invalid update was accepted or partially applied';
  end if;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  rejected := false;
  begin
    perform public.update_purchase(target, payload);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Another user edited the purchase'; end if;
  delete from public.purchases where id = target;
  set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  if not exists (select 1 from public.purchases where id = target) then
    raise exception 'Another user deleted the purchase';
  end if;

  delete from public.purchases where id = target;
  if exists (select 1 from public.purchases where id = target)
    or exists (select 1 from public.purchase_items where purchase_id = target) then
    raise exception 'Delete left the purchase or its items behind';
  end if;
end;
$$;
SQL
echo 'Edit and delete passed'

# Budget changes are recorded per week; owners can read only their own history
# and cannot write it directly.
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  this_week date := date_trunc('week',
    now() at time zone (select timezone from public.profiles))::date;
  rejected boolean := false;
begin
  update public.food_budgets set grocery_weekly_cents = 9000, meals_out_weekly = 3;
  update public.food_budgets set grocery_weekly_cents = 9500;
  if (select count(*) from public.budget_history where effective_week = this_week) <> 1
    or (select grocery_weekly_cents || '/' || meals_out_weekly from public.budget_history
        where effective_week = this_week) <> '9500/3' then
    raise exception 'Budget change was not recorded once for this week';
  end if;
  begin
    insert into public.budget_history values
      (auth.uid(), this_week - 7, 1, 1);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'User wrote budget history directly'; end if;

  set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  if exists (select 1 from public.budget_history
             where user_id = '11111111-1111-4111-8111-111111111111') then
    raise exception 'Another user can read budget history';
  end if;
end;
$$;
SQL
echo 'Budget history passed'
