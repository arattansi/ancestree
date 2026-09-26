import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { signInNext } from "@/lib/safe-next";
import {
  isSupabaseConfigured,
  noteActiveDay,
  updateSession,
} from "@/lib/supabase/middleware";

// Routes reachable without an authenticated session.
const PUBLIC_PREFIXES = [
  "/join",
  "/auth",
  "/login",
  "/privacy",
  "/request-invite",
  "/shared",
];

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Before Supabase env is wired (Step 1 pre-config), do nothing so the app boots.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // A day they used ancestree, for the beta reviewers' dashboard (Step 56),
  // noted in the background so no page waits on it.
  if (user) event.waitUntil(noteActiveDay(supabase, user.id));

  const isPublic =
    pathname === "/" ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!user && !isPublic) {
    // To sign in, and back here after (Step 30.1): an alert email's button
    // opened while signed out, or any other members' link.
    const url = request.nextUrl.clone();
    url.pathname = "/join";
    url.search = "";
    const next =
      request.method === "GET"
        ? signInNext(pathname, request.nextUrl.search)
        : null;
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  // opengraph-image has no file extension, so it needs naming here: link
  // preview crawlers are never signed in and would be sent to /join.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
