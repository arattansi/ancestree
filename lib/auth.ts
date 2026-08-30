import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;

/** The signed-in Supabase auth user, or `null`. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The signed-in user's member profile, or `null` if they are not signed in or
 * have authenticated but never completed the invite / bootstrap flow.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return data ?? null;
}

/**
 * Require a member profile for a route. Redirects unauthenticated users to
 * `/join`, and authenticated-but-not-a-member users to `/join?status=pending`.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) {
    const user = await getUser();
    redirect(user ? "/join?status=pending" : "/join");
  }
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/tree");
  return profile;
}
