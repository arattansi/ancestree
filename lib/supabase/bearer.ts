import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * A Supabase client for a request from the phone app (Step 148), which
 * holds no cookies: it sends its session's access token as a bearer token
 * instead (`docs/mobile-server-paths.md`). The client acts as that member,
 * under the same RLS as the web's cookie client. Routes using it sit under
 * `/api/mobile/`, which `proxy.ts` lets through without a cookie.
 */

/** The bearer token a request carries, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * The member the token names, and a client acting as them, or null when the
 * token isn't a live session's. The token is checked as the web checks a
 * cookie's (`getSessionUser`): against the project's signing key.
 */
export async function bearerClient(
  token: string,
): Promise<{ supabase: SupabaseClient<Database>; userId: string } | null> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return { supabase, userId };
}
