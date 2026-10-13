import "react-native-url-polyfill/auto";

import { createClient, processLock } from "@supabase/supabase-js";
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
 * The one Supabase client: the same project, RLS and RPCs as the web, as
 * the signed-in member. The anon key only; anything that needs the service
 * role goes through the web's server (see docs/mobile-server-paths.md).
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
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
