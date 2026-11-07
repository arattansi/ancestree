import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { NotedToday, utcDay } from "@/lib/active-days";
import type { Database } from "@/lib/database.types";
import type { NewsletterSection } from "@/lib/newsletter-clicks";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: keep getClaims() close to createServerClient: it refreshes an
  // expired session before reading it. It checks the token against the
  // project's signing key rather than asking the Auth server (Step 61).
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;

  return { supabaseResponse, userId, supabase };
}

/** Who this server has noted today (Step 56). */
const notedToday = new NotedToday();

/**
 * Notes that a signed-in member used ancestree today, for the beta
 * reviewers' dashboard (Step 56): one call on their first request of the
 * day to reach this server, none after. `getClaims()` has just refreshed the
 * session if it needed it, so the call never refreshes it again. A failure
 * is logged and not retried until tomorrow.
 */
export async function noteActiveDay(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  if (!notedToday.claim(userId, utcDay(new Date()))) return;
  const { data, error } = await supabase.rpc("note_active_day");
  if (error) {
    console.error("[active-days] couldn't note the day", error.code);
    return;
  }
  // Signed in but not a member yet: ask again on their next request.
  if (data !== true) notedToday.release(userId);
}

/** Newsletter arrivals this server has told the database of (Step 225). */
const clicksNoted = new Set<string>();
const CLICKS_NOTED_MAX = 5_000;

/**
 * Notes that a signed-in member arrived from one of a weekly issue's tagged
 * links (Step 225), for the analytics tab: once per member, block and issue
 * to reach this server (the database counts each once anyway). A link
 * opened signed out isn't counted, and neither is a router's prefetch. A
 * failure is logged, and tried again on the next arrival.
 */
export async function noteNewsletterClick(
  supabase: SupabaseClient<Database>,
  userId: string,
  click: { issueDay: string; section: NewsletterSection },
): Promise<void> {
  const key = `${userId}|${click.issueDay}|${click.section}`;
  if (clicksNoted.has(key)) return;
  if (clicksNoted.size >= CLICKS_NOTED_MAX) clicksNoted.clear();
  clicksNoted.add(key);
  const { error } = await supabase.rpc("note_newsletter_click", {
    p_issue: click.issueDay,
    p_section: click.section,
  });
  if (error) {
    console.error("[newsletter-clicks] couldn't note it", error.code);
    clicksNoted.delete(key);
  }
}
