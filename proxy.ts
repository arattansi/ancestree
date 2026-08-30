import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, updateSession } from "@/lib/supabase/middleware";

// Routes reachable without an authenticated session.
const PUBLIC_PREFIXES = ["/join", "/auth", "/login", "/privacy"];

export async function proxy(request: NextRequest) {
  // Before Supabase env is wired (Step 1 pre-config), do nothing so the app boots.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/" ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/join";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
