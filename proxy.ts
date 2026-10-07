import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

import {
  CURRENT_TREE_COOKIE,
  currentTreeCookieOptions,
  isTreeIdCookie,
  renewsPick,
} from "@/lib/current-tree-cookie";
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
  // The marketing pages (Step 107); the home page is "/", below.
  "/pricing",
  "/manifesto",
  "/features",
  "/about-us",
  // The blog, /library (Step 134): its published posts are anyone's to read.
  "/library",
  "/api/library/",
  // For search engines (Step 135).
  "/sitemap.xml",
  "/robots.txt",
  "/request-invite",
  "/shared",
  // Campaign links, where anyone can sign up and start a tree (Step 103.3).
  "/start/",
  // The weekly newsletter's unsubscribe page and one-click link, which
  // work signed out, and its weekly job, which checks its own secret
  // (Step 95).
  "/newsletter",
  "/api/newsletter",
  "/api/cron",
];

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Before Supabase env is wired (Step 1 pre-config), do nothing so the app boots.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const { supabaseResponse, userId, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // A day they used ancestree, for the beta reviewers' dashboard (Step 56),
  // noted in the background so no page waits on it.
  if (userId) event.waitUntil(noteActiveDay(supabase, userId));

  const isPublic =
    pathname === "/" ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!userId && !isPublic) {
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

  // A tree picked this visit stays picked while they keep using the site,
  // two hours from their last page (`lib/current-tree-cookie.ts`).
  const picked = request.cookies.get(CURRENT_TREE_COOKIE)?.value;
  if (
    userId &&
    isTreeIdCookie(picked) &&
    renewsPick(request.method, pathname)
  ) {
    supabaseResponse.cookies.set(
      CURRENT_TREE_COOKIE,
      picked,
      currentTreeCookieOptions(),
    );
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
