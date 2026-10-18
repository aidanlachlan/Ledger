-- Record the weekly limits that applied to each week, so history charts can
-- compare past weeks with the budget of the time. Apply after 0003.
--
-- A row says: from this Monday onward (until a later row), these were the
-- limits. A budget change applies to the current week, matching Home.
create table public.budget_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_week date not null check (extract(isodow from effective_week) = 1),
  grocery_weekly_cents integer not null
    check (grocery_weekly_cents between 0 and 1000000),
  meals_out_weekly integer not null check (meals_out_weekly between 0 and 100),
  primary key (user_id, effective_week)
);
alter table public.budget_history enable row level security;
-- Read-only for owners; rows are written only by the trigger below.
create policy own_rows_read on public.budget_history for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.budget_history from public, anon, authenticated;
grant select on public.budget_history to authenticated;

create function public.record_budget_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  week date;
begin
  select pg_catalog.date_trunc('week', (pg_catalog.now() at time zone p.timezone))::date
    into week from public.profiles p where p.user_id = new.user_id;
  -- Profiles are created first; fall back to UTC if one is somehow missing.
  week := coalesce(week, pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'UTC')::date);
  insert into public.budget_history (user_id, effective_week, grocery_weekly_cents, meals_out_weekly)
    values (new.user_id, week, new.grocery_weekly_cents, new.meals_out_weekly)
    on conflict (user_id, effective_week) do update set
      grocery_weekly_cents = excluded.grocery_weekly_cents,
      meals_out_weekly = excluded.meals_out_weekly;
  return new;
end;
$$;
revoke all on function public.record_budget_history() from public, anon, authenticated;
create trigger food_budgets_history
  after insert or update of grocery_weekly_cents, meals_out_weekly
  on public.food_budgets for each row execute function public.record_budget_history();

-- Backfill: existing users' current limits apply from their earliest week on
-- record (first purchase or sign-up), since no earlier changes were tracked.
insert into public.budget_history (user_id, effective_week, grocery_weekly_cents, meals_out_weekly)
select b.user_id,
  pg_catalog.date_trunc('week', least(
    (select min(p.purchased_on) from public.purchases p where p.user_id = b.user_id),
    (pr.created_at at time zone pr.timezone)::date
  ))::date,
  b.grocery_weekly_cents, b.meals_out_weekly
from public.food_budgets b join public.profiles pr on pr.user_id = b.user_id
on conflict do nothing;
