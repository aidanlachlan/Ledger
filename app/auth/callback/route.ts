import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { appOrigin } from "../../../lib/auth";
export async function GET(request: NextRequest) {
  const origin = await appOrigin();
  const code = request.nextUrl.searchParams.get("code");
  if (code && code.length <= 4096) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/", origin));
    } catch {
      /* Expired or invalid links get a fresh-link prompt. */
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", origin));
}
