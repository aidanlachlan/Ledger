import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";
import { appOrigin } from "../../lib/auth";

// Exchanges an email link's one-time code for a cookie session, then sends
// the user to a fixed page. Destinations are never read from the URL.
export async function exchangeCode(request: NextRequest, destination: string) {
  const origin = await appOrigin();
  const code = request.nextUrl.searchParams.get("code");
  if (code && code.length <= 4096) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(destination, origin));
    } catch {
      /* Expired or invalid links get a fresh-link prompt. */
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", origin));
}
