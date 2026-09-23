import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";

import { setCurrentTreeCookie } from "@/lib/current-tree.server";
import {
  joiningDisplayName,
  readJoiningName,
  type JoiningName,
} from "@/lib/joining-name";
import { signInLanding } from "@/lib/open-console.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { joinedTreeHref } from "@/lib/tree-links";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Anyone can type a `next` into /join's address now (Step 30.1), so the
// check lives in a pure module with its tests.
export { safeNext } from "@/lib/safe-next";

export type RedeemedTree = {
  treeId: string;
  treeSlug: string;
  treeName: string;
  selfPersonId: string | null;
  /**
   * Their own entry is on the tree they joined: a claim invite claims its
   * entry as it's redeemed (Step 30.2), or it was there already.
   */
  selfPlaced: boolean;
};

/**
 * Redeem an invite as the signed-in user (Step 25): a profile if they have
 * none, a membership in the invite's tree — or, for a founder invite, a
 * brand-new tree with them as Root. Says which tree was joined, and makes
 * it the one their browser is looking at. Only from a server action or
 * route handler, since it writes a cookie.
 */
export async function redeemInvite(
  supabase: ServerClient,
  token: string,
  displayName?: string,
): Promise<RedeemedTree | null> {
  const { data, error } = await supabase.rpc("redeem_invite_tree", {
    p_token: token,
    p_display_name: displayName,
  });
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  if (typeof row.tree_id !== "string" || typeof row.tree_slug !== "string") {
    return null;
  }
  await setCurrentTreeCookie(row.tree_id);
  return {
    treeId: row.tree_id,
    treeSlug: row.tree_slug,
    treeName: typeof row.tree_name === "string" ? row.tree_name : "",
    selfPersonId:
      typeof row.self_person_id === "string" ? row.self_person_id : null,
    selfPlaced: row.self_placed === true,
  };
}

/**
 * Turn a fresh session into a member: redeem the invite, or provision an
 * allowlisted admin. Returns where to send them — an invite lands on their
 * own entry once the joined tree shows it (a claim invite claims it on the
 * way in), else on that tree's onboarding, to find or add themselves there.
 */
export async function establishMembership(
  supabase: ServerClient,
  {
    invite,
    next,
    displayName,
  }: { invite?: string | null; next: string; displayName?: string },
): Promise<string> {
  if (invite) {
    const joined = await redeemInvite(supabase, invite, displayName);
    return joined ? joinedTreeHref(joined) : "/join?error=invite";
  }
  const { error } = await supabase.rpc("ensure_profile", {});
  // An alert email's button, opened while signed out, lands on its card.
  return error ? "/join?status=pending" : signInLanding(next);
}

/**
 * Spend the one-time token from a sign-in email and return where to go next.
 *
 * Only ever called from a POST (the button on /auth/confirm), never from the
 * GET the email links to: mail scanners — Outlook Safe Links above all — open
 * every link in a message before the recipient does, and a GET that verified
 * would hand them the token and leave the real click with "already used".
 */
export async function completeEmailSignIn({
  tokenHash,
  type,
  invite,
  next,
}: {
  tokenHash: string;
  type: EmailOtpType;
  invite?: string | null;
  next: string;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  let user = data.user;

  if (error) {
    // A second tap on a link this browser already spent: they are signed in,
    // so carry on rather than telling them the link is used up.
    const {
      data: { user: signedIn },
    } = await supabase.auth.getUser();
    if (!signedIn) return "/auth/auth-code-error";
    user = signedIn;
  }

  // A bare invite link's form kept their name on the new account: the
  // profile the invite makes is named after it, not the address (Step 30.7).
  return establishMembership(supabase, {
    invite,
    next,
    displayName: joiningDisplayName(readJoiningName(user?.user_metadata)),
  });
}

export type InviteRecipient = {
  email: string;
  /** "First Last" when the invite was sent to a named person. */
  name: string | null;
  /**
   * The same name in its halves, for their new account to keep: the request
   * row goes when the invite is redeemed, and onboarding searches by it
   * (Step 30.7).
   */
  joiningName: JoiningName | null;
  /**
   * True when they asked — to join, or to start a tree from the waitlist
   * (Step 30.6) — and so accepted the privacy notice then.
   */
  requested: boolean;
};

/**
 * Who a live invite was emailed to, or `null` for a bare link (or a dead one).
 * An invite with a recipient doubles as their sign-in link; a bare link has
 * nobody to sign in, so it still asks for an address.
 */
export async function getInviteRecipient(
  token: string,
): Promise<InviteRecipient | null> {
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invites")
    .select(
      "status, expires_at, invited_email, invite_requests(first_name, last_name, email, source)",
    )
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.status !== "active") return null;
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return null;

  // One-to-one FK that PostgREST still hands back as an array.
  const request = Array.isArray(invite.invite_requests)
    ? invite.invite_requests[0]
    : invite.invite_requests;

  // Invites approved before `invited_email` was filled in only have the
  // address on their request row.
  const email = (invite.invited_email ?? request?.email ?? "").trim().toLowerCase();
  if (!email) return null;

  const name = request
    ? `${request.first_name} ${request.last_name}`.trim() || null
    : null;
  return {
    email,
    name,
    joiningName: readJoiningName(request),
    requested: request?.source === "request",
  };
}

export type InviteSignInResult =
  | {
      ok: true;
      treeId: string;
      /** Where to land: see `joinedTreeHref`. */
      next: string;
    }
  | { ok: false; reason: "invalid" | "already_member" | "failed" };

/**
 * Accept an emailed invite in one step: create the account for the address
 * the invite went to, sign this browser in as it, and redeem the invite.
 *
 * The invite link reached that inbox, which is all a sign-in email would
 * prove — so we mint the one-time token ourselves and spend it on the spot
 * instead of mailing a second link. Refuses an address that is already a
 * member: their invite must not double as a 14-day key to a live account —
 * a member joins another tree from the invite page while signed in.
 */
export async function signInWithInvite(token: string): Promise<InviteSignInResult> {
  const recipient = await getInviteRecipient(token);
  if (!recipient) return { ok: false, reason: "invalid" };

  const admin = createAdminClient();

  // Make sure the account exists and is confirmed. An address that has signed
  // in before comes back as "already registered", which is fine. A new one
  // keeps the name the invite was sent to, for onboarding (Step 30.7).
  await admin.auth.admin.createUser({
    email: recipient.email,
    email_confirm: true,
    user_metadata: recipient.joiningName ?? undefined,
  });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: recipient.email,
  });
  if (linkError || !link.user || !link.properties?.hashed_token) {
    return { ok: false, reason: "failed" };
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("auth_user_id")
    .eq("auth_user_id", link.user.id)
    .maybeSingle();
  if (existing) return { ok: false, reason: "already_member" };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) return { ok: false, reason: "failed" };

  const joined = await redeemInvite(supabase, token, recipient.name ?? undefined);
  if (!joined) return { ok: false, reason: "invalid" };

  return { ok: true, treeId: joined.treeId, next: joinedTreeHref(joined) };
}
