import { type NextRequest, NextResponse } from "next/server";

import { establishMembership, safeNext } from "@/lib/sign-in.server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const invite = searchParams.get("invite");
  const next = safeNext(searchParams.get("next"));

  // The link in our sign-in emails. Verifying here would let a mail scanner's
  // prefetch spend the one-time token before the recipient clicks, so hand the
  // params to a page whose button does the verifying. Emails already sent
  // point at this route, which is why the template still does too.
  if (searchParams.get("token_hash") && searchParams.get("type")) {
    const confirm = new URL("/auth/confirm", origin);
    confirm.search = request.nextUrl.search;
    return NextResponse.redirect(confirm);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", origin));
  }

  const destination = await establishMembership(supabase, { invite, next });
  return NextResponse.redirect(new URL(destination, origin));
}
