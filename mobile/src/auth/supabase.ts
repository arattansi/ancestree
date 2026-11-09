import "react-native-url-polyfill/auto";

import { createClient, type Session } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import type { Database } from "@/lib/database.types";
import { sessionStorage } from "@/auth/secure-storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are missing: copy mobile/.env.example to mobile/.env.local.",
  );
}

/**
 * Where the session is kept: the name Supabase gives it by default
 * (`sb-<project>-auth-token`), spelled out so `storedSession` reads the
 * same value. Changing it would sign everyone out.
 */
const SESSION_KEY = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

/**
 * The one Supabase client: the same project, RLS and RPCs as the web, as
 * the signed-in member. The anon key only; anything that needs the service
 * role goes through the web's server (see docs/mobile-server-paths.md).
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: sessionStorage,
    storageKey: SESSION_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is in front, as Supabase advises
// for React Native: a backgrounded app can't run the timer anyway.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/**
 * The session as the Keychain has it, expired or not, with no trip to the
 * server: who was signed in when the app last ran. Throws if the Keychain
 * can't be read.
 */
export async function storedSession(): Promise<Session | null> {
  const raw = await sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Partial<Session> | null;
    return session?.access_token && session.refresh_token && session.user?.id
      ? (session as Session)
      : null;
  } catch {
    return null;
  }
}
