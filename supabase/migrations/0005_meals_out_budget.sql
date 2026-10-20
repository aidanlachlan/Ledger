-- Optional weekly dollar budget for eating out, alongside the meal count.
-- Null means no meals-out budget is set. Apply after 0004.
alter table public.food_budgets add column meals_out_weekly_cents integer
  check (meals_out_weekly_cents between 0 and 1000000);
alter table public.budget_history add column meals_out_weekly_cents integer
  check (meals_out_weekly_cents between 0 and 1000000);

create or replace function public.record_budget_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  week date;
begin
  select pg_catalog.date_trunc('week', (pg_catalog.now() at time zone p.timezone))::date
    into week from public.profiles p where p.user_id = new.user_id;
  -- Profiles are created first; fall back to UTC if one is somehow missing.
  week := coalesce(week, pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'UTC')::date);
  insert into public.budget_history (user_id, effective_week, grocery_weekly_cents,
      meals_out_weekly, meals_out_weekly_cents)
    values (new.user_id, week, new.grocery_weekly_cents, new.meals_out_weekly,
      new.meals_out_weekly_cents)
    on conflict (user_id, effective_week) do update set
      grocery_weekly_cents = excluded.grocery_weekly_cents,
      meals_out_weekly = excluded.meals_out_weekly,
      meals_out_weekly_cents = excluded.meals_out_weekly_cents;
  return new;
end;
$$;

drop trigger food_budgets_history on public.food_budgets;
create trigger food_budgets_history
  after insert or update of grocery_weekly_cents, meals_out_weekly, meals_out_weekly_cents
  on public.food_budgets for each row execute function public.record_budget_history();
