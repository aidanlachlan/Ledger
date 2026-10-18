-- Edit a saved purchase. Apply after 0002_manual_items.sql.
-- Validation is reused from save_purchase: the reviewed values are saved as a
-- scratch purchase, then moved onto the original row so its id, request id,
-- source and created_at are kept. Everything runs in one transaction.
create function public.update_purchase(p_purchase_id uuid, p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  original public.purchases;
  scratch public.purchases;
  scratch_id uuid;
begin
  if auth.uid() is null or p_purchase_id is null then
    raise exception 'Authentication and purchase ID required';
  end if;
  select * into original from public.purchases
    where id = p_purchase_id and user_id = auth.uid() for update;
  if not found then raise exception 'Purchase not found'; end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid purchase fields';
  end if;

  scratch_id := public.save_purchase(
    p_payload || pg_catalog.jsonb_build_object('source', original.source),
    gen_random_uuid());
  select * into scratch from public.purchases where id = scratch_id;

  delete from public.purchase_items where purchase_id = original.id;
  update public.purchase_items set purchase_id = original.id
    where purchase_id = scratch.id;
  update public.purchases set
    store_name = scratch.store_name, purchased_on = scratch.purchased_on,
    type = scratch.type, subtotal_cents = scratch.subtotal_cents,
    savings_cents = scratch.savings_cents, tax_cents = scratch.tax_cents,
    total_cents = scratch.total_cents, math_check = scratch.math_check,
    note = scratch.note
    where id = original.id;
  delete from public.purchases where id = scratch.id;
  return original.id;
end;
$$;
revoke all on function public.update_purchase(uuid,jsonb) from public, anon;
grant execute on function public.update_purchase(uuid,jsonb) to authenticated;
