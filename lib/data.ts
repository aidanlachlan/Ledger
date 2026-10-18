import { z } from "zod";
import { requireUser } from "./auth";
import type { BudgetChange } from "./history";
import { todayIn } from "./week";

const purchaseRow = z.object({
  id: z.string(),
  store_name: z.string(),
  purchased_on: z.string(),
  type: z.enum(["groceries", "eating_out", "convenience"]),
  total_cents: z.number().int(),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type Purchase = z.infer<typeof purchaseRow>;

const purchaseDetail = purchaseRow.extend({
  request_id: z.string(),
  source: z.enum(["manual", "paste"]),
  subtotal_cents: z.number().int().nullable(),
  savings_cents: z.number().int(),
  tax_cents: z.number().int().nullable(),
  math_check: z.enum(["ok", "mismatch", "skipped"]),
  purchase_items: z.array(
    z.object({
      position: z.number().int(),
      name: z.string(),
      quantity: z.number(),
      unit_price_cents: z.number().int().nullable(),
      line_total_cents: z.number().int(),
      savings_cents: z.number().int(),
    }),
  ),
});
export type PurchaseDetail = z.infer<typeof purchaseDetail>;

// Null when the purchase does not exist or belongs to someone else (RLS).
export async function getPurchase(id: string): Promise<PurchaseDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id,request_id,store_name,purchased_on,type,source,subtotal_cents,savings_cents,tax_cents,total_cents,math_check,note,created_at,purchase_items(position,name,quantity,unit_price_cents,line_total_cents,savings_cents)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new Error("The purchase could not be loaded. Please try again.");
  if (!data) return null;
  const purchase = purchaseDetail.parse(data);
  purchase.purchase_items.sort((a, b) => a.position - b.position);
  return purchase;
}

export async function getBudgetHistory(): Promise<BudgetChange[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("budget_history")
    .select("effective_week,grocery_weekly_cents,meals_out_weekly")
    .order("effective_week");
  if (error)
    throw new Error(
      "Your budget history could not be loaded. Please try again.",
    );
  return z
    .array(
      z.object({
        effective_week: z.string(),
        grocery_weekly_cents: z.number().int(),
        meals_out_weekly: z.number().int(),
      }),
    )
    .parse(data);
}

export async function getContext() {
  const { supabase } = await requireUser();
  const [profile, budget] = await Promise.all([
    supabase.from("profiles").select("timezone").single(),
    supabase
      .from("food_budgets")
      .select("grocery_weekly_cents,meals_out_weekly")
      .single(),
  ]);
  if (profile.error || budget.error)
    throw new Error("Your settings could not be loaded. Please try again.");
  const timezone = z
    .object({ timezone: z.string() })
    .parse(profile.data).timezone;
  const limits = z
    .object({
      grocery_weekly_cents: z.number().int(),
      meals_out_weekly: z.number().int(),
    })
    .parse(budget.data);
  return { supabase, timezone, today: todayIn(timezone), ...limits };
}

const purchaseColumns =
  "id,store_name,purchased_on,type,total_cents,note,created_at";
const loadError = "Purchases could not be loaded. Please try again.";

/** Purchases dated on or after `since` (and before `until`), newest first. */
export async function getPurchases(
  since: string,
  until?: string,
): Promise<Purchase[]> {
  const { supabase } = await requireUser();
  const result: Purchase[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from("purchases")
      .select(purchaseColumns)
      .gte("purchased_on", since)
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 499);
    if (until) query = query.lt("purchased_on", until);
    const { data, error } = await query;
    if (error) throw new Error(loadError);
    const rows = z.array(purchaseRow).parse(data);
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}

/** The latest purchases by date, or by save time with `bySaved`. */
export async function getRecentPurchases(
  limit: number,
  bySaved = false,
): Promise<Purchase[]> {
  const { supabase } = await requireUser();
  let query = supabase.from("purchases").select(purchaseColumns);
  if (!bySaved) query = query.order("purchased_on", { ascending: false });
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(loadError);
  return z.array(purchaseRow).parse(data);
}

/** Distinct store names for autocomplete, sorted. */
export async function getStoreNames(): Promise<string[]> {
  const { supabase } = await requireUser();
  const names = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("purchases")
      .select("store_name")
      .order("store_name")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(loadError);
    const rows = z.array(z.object({ store_name: z.string() })).parse(data);
    rows.forEach((row) => names.add(row.store_name));
    if (rows.length < 1000) return [...names].sort();
  }
}
