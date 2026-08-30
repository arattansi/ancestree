import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Only allow same-origin relative redirect targets. */
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/tree";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const invite = searchParams.get("invite");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  let authError: string | null = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    authError = error?.message ?? null;
  } else {
    authError = "missing_code";
  }

  if (authError) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
  }

  // Establish membership: redeem the invite, or provision an allowlisted admin.
  if (invite) {
    const { error } = await supabase.rpc("redeem_invite", { p_token: invite });
    if (error) {
      return NextResponse.redirect(new URL("/join?error=invite", origin));
    }
  } else {
    const { error } = await supabase.rpc("ensure_profile", {});
    if (error) {
      return NextResponse.redirect(new URL("/join?status=pending", origin));
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
