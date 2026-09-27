import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { PENDING_HREF } from "@/lib/sign-in-links";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type Profile = Tables<"profiles">;

/** Who the session's token says is signed in. */
export type SessionUser = { id: string; email: string | null };

/**
 * The signed-in user as their session's token names them, or `null`
 * (Step 61). The token is checked against the project's published signing
 * key, which auth-js keeps for every request this server handles, so
 * nothing leaves the server; while the project signs with a shared secret,
 * auth-js asks the Auth server instead. Read once per render: the header,
 * the page and every helper they call share one answer.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});

/**
 * The signed-in Supabase auth user, or `null`, from the Auth server: for
 * what the token can't vouch for, such as whether the address has been
 * confirmed. Once per render.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The signed-in user's member profile, or `null` if they are not signed in or
 * have authenticated but never completed the invite / bootstrap flow. Once
 * per render.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return data ?? null;
});

/**
 * Require a member profile for a route. Redirects unauthenticated users to
 * `/join`, and authenticated-but-not-a-member users to `/join?status=pending`,
 * which opens an invite waiting for their address (Step 30.8).
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) {
    const user = await getSessionUser();
    redirect(user ? PENDING_HREF : "/join");
  }
  return profile;
}

/**
 * Require a member who has completed first-run onboarding (their own person
 * entry). Sends members without one to `/onboarding`.
 */
export async function requireSelfPerson(): Promise<Profile> {
  const profile = await requireProfile();
  if (!profile.self_person_id) redirect("/onboarding");
  return profile;
}
