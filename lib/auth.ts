import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

// Cached so a page with several data helpers asks Supabase Auth only once.
export const requireUser = cache(async () => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    redirect("/sign-in");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/sign-in");
  return { supabase, user: data.user };
});

export async function appOrigin(): Promise<string> {
  if (process.env.APP_ORIGIN) {
    const url = new URL(process.env.APP_ORIGIN);
    if (
      url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")
    )
      throw new Error("Invalid app origin.");
    return url.origin;
  }
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (host) return new URL(`https://${host}`).origin;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("Set APP_ORIGIN to the deployed app origin.");
}
