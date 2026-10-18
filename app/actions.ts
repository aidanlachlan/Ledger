"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appOrigin, requireUser } from "../lib/auth";
import { createClient } from "../lib/supabase/server";
import {
  passwordInput,
  purchaseInput,
  settingsInput,
  type ActionResult,
} from "../lib/validation";
import { todayIn } from "../lib/week";

export async function signIn(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ email: z.email().max(254) })
    .safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: "Enter a valid email address." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: {
        emailRedirectTo: `${await appOrigin()}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    if (error)
      return {
        error:
          "The sign-in link could not be requested. Please try again shortly.",
      };
    return {
      success:
        "If email delivery is available, a sign-in link is on its way. Open it in this browser.",
    };
  } catch {
    return { error: "Sign-in is unavailable. Please try again shortly." };
  }
}

export async function signInWithPassword(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(72) })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error?.code === "email_not_confirmed")
      return {
        error: "Confirm your email first using the link we sent, then sign in.",
      };
    if (error)
      return {
        error:
          "That email and password don't match. If you haven't set a password yet, sign in with an email link.",
      };
  } catch {
    return { error: "Sign-in is unavailable. Please try again shortly." };
  }
  redirect("/");
}

export async function signUp(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ email: z.email().max(254), password: passwordInput })
    .safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: { emailRedirectTo: `${await appOrigin()}/auth/callback` },
    });
    if (error?.code === "weak_password")
      return { error: "Choose a stronger password." };
    if (error)
      return {
        error: "Your account could not be created. Please try again shortly.",
      };
    // With email confirmation off, Supabase signs the user in immediately.
    signedIn = Boolean(data.session);
  } catch {
    return { error: "Sign-up is unavailable. Please try again shortly." };
  }
  if (signedIn) redirect("/");
  return {
    success:
      "Check your email and open the confirmation link in this browser. After that, you can sign in with your password.",
  };
}

export async function setPassword(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({ password: passwordInput, confirm: z.string() })
    .refine((v) => v.password === v.confirm, "The passwords don't match.")
    .safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase } = await requireUser();
  try {
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error?.code === "same_password")
      return { error: "That's already your password." };
    if (error?.code === "weak_password")
      return { error: "Choose a stronger password." };
    if (error)
      return { error: "Your password could not be saved. Please retry." };
    return {
      success: "Password saved. You can now sign in with it on any device.",
    };
  } catch {
    return { error: "Your password could not be saved. Please retry." };
  }
}

export async function signOut(form: FormData) {
  const valid = z
    .object({ intent: z.literal("sign-out") })
    .safeParse({ intent: form.get("intent") });
  if (!valid.success) redirect("/?error=sign-out");
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/?error=sign-out");
  redirect("/sign-in");
}

export async function saveSettings(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = settingsInput.safeParse({
    budget: form.get("budget"),
    meals: form.get("meals"),
    timezone: form.get("timezone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireUser();
  try {
    const profile = await supabase
      .from("profiles")
      .update({ timezone: parsed.data.timezone })
      .eq("user_id", user.id)
      .select("user_id")
      .single();
    if (profile.error)
      return {
        error:
          "Settings could not be saved. Your values are still here. Please retry.",
      };
    const budget = await supabase
      .from("food_budgets")
      .update({
        grocery_weekly_cents: parsed.data.budget,
        meals_out_weekly: parsed.data.meals,
      })
      .eq("user_id", user.id)
      .select("user_id")
      .single();
    if (budget.error)
      return {
        error:
          "Your timezone was saved, but your budget could not be saved. Please retry.",
      };
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: "Settings saved. These limits apply to this week." };
  } catch {
    return {
      error:
        "Settings could not be fully saved. Please retry with the values shown.",
    };
  }
}

type PurchasePayload = Record<string, unknown>;

// Checks the date against the saved timezone and builds the RPC payload
// shared by save and update.
async function reviewedPayload(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  p: z.infer<typeof purchaseInput>,
): Promise<
  { error: string } | { requestId: string; payload: PurchasePayload }
> {
  const profile = await supabase.from("profiles").select("timezone").single();
  if (profile.error)
    return { error: "Your timezone could not be loaded. Please retry." };
  const timezone = z
    .object({ timezone: z.string() })
    .parse(profile.data).timezone;
  if (p.purchasedOn > todayIn(timezone))
    return { error: "The purchase date cannot be in the future." };
  const items = p.items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    unitPriceCents: i.unitPrice,
    lineTotalCents: i.lineTotal,
    savingsCents: i.savings,
  }));
  return {
    requestId: p.requestId,
    payload: {
      storeName: p.storeName,
      purchasedOn: p.purchasedOn,
      type: p.type,
      source: p.source,
      subtotalCents: p.subtotal,
      savingsCents: p.savings,
      taxCents: p.tax,
      totalCents: p.total,
      note: p.note || null,
      items,
    },
  };
}

function revalidatePurchases(id?: string) {
  revalidatePath("/");
  revalidatePath("/add");
  revalidatePath("/paste");
  if (id) revalidatePath(`/purchases/${id}`);
}

export async function savePurchase(input: unknown): Promise<ActionResult> {
  const parsed = purchaseInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase } = await requireUser();
  try {
    const reviewed = await reviewedPayload(supabase, parsed.data);
    if ("error" in reviewed) return reviewed;
    const { data, error } = await supabase.rpc("save_purchase", {
      p_request_id: reviewed.requestId,
      p_payload: reviewed.payload,
    });
    if (error || typeof data !== "string")
      return {
        error:
          "The purchase could not be saved. Your edits are still here. Please retry.",
      };
    revalidatePurchases();
    return { id: data };
  } catch {
    return {
      error:
        "The purchase could not be saved. Your edits are still here. Please retry.",
    };
  }
}

export async function updatePurchase(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success)
    return { error: "This purchase could not be found." };
  const parsed = purchaseInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase } = await requireUser();
  try {
    const reviewed = await reviewedPayload(supabase, parsed.data);
    if ("error" in reviewed) return reviewed;
    const { data, error } = await supabase.rpc("update_purchase", {
      p_purchase_id: id,
      p_payload: reviewed.payload,
    });
    if (error || data !== id)
      return {
        error:
          "Your changes could not be saved. Your edits are still here. Please retry.",
      };
    revalidatePurchases(id);
    return { id };
  } catch {
    return {
      error:
        "Your changes could not be saved. Your edits are still here. Please retry.",
    };
  }
}

export async function deletePurchase(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success)
    return { error: "This purchase could not be found." };
  const { supabase } = await requireUser();
  try {
    // RLS limits this to the user's own purchase; its items cascade.
    const { data, error } = await supabase
      .from("purchases")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || data?.length !== 1)
      return { error: "The purchase could not be deleted. Please retry." };
    revalidatePurchases(id);
    return { id };
  } catch {
    return { error: "The purchase could not be deleted. Please retry." };
  }
}
