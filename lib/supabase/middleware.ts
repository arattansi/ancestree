import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { NotedToday, utcDay } from "@/lib/active-days";
import type { Database } from "@/lib/database.types";

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

  // IMPORTANT: keep getUser() close to createServerClient to refresh tokens.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user, supabase };
}

/** Who this server has noted today (Step 56). */
const notedToday = new NotedToday();

/**
 * Notes that a signed-in member used ancestree today, for the beta
 * reviewers' dashboard (Step 56): one call on their first request of the
 * day to reach this server, none after. `getUser()` has just refreshed the
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
