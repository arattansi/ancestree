import "server-only";

import type { EmailOtpType } from "@supabase/supabase-js";

import { setCurrentTreeCookie } from "@/lib/current-tree.server";
import { verifiedEmail } from "@/lib/first-timer";
import { waitingInviteHref } from "@/lib/first-timer.server";
import {
  joiningDisplayName,
  readJoiningName,
  type JoiningName,
} from "@/lib/joining-name";
import { signInLanding } from "@/lib/open-console.server";
import { inviteHref, PENDING_HREF, signInCallbackUrl } from "@/lib/sign-in-links";
import { getSiteUrl } from "@/lib/site-url";
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
   * entry as it's redeemed (Step 30.2), accepting placed theirs (Step 30.9,
   * and for a claim invite Step 41.3), or it was there already.
   */
  selfPlaced: boolean;
  /** The invite named an entry to claim (Step 50). */
  claimInvite: boolean;
  /** They had an entry of their own before it was redeemed (Step 50). */
  hadEntry: boolean;
  /** They were on its tree before it was redeemed (Step 50). */
  wasMember: boolean;
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
    claimInvite: row.claim_invite === true,
    hadEntry: row.had_entry === true,
    wasMember: row.was_member === true,
  };
}

/**
 * Turn a fresh session into a member: redeem the invite, or provision an
 * allowlisted admin. Returns where to send them — an invite lands on their
 * own entry once the joined tree shows it (a claim invite claims it on the
 * way in, and goes by the welcome first, Step 50), else on that tree's
 * onboarding, to find or add themselves there.
 *
 * Anyone else is a first-timer (Step 30.8): an invite emailed to the
 * address they've just verified (`email`) opens on its own page, whose
 * accept form asks for the privacy agreement a plain sign-in doesn't (Step
 * 30.4). With none, /join says where their request stands, or offers one.
 */
export async function establishMembership(
  supabase: ServerClient,
  {
    invite,
    next,
    displayName,
    email,
  }: {
    invite?: string | null;
    next: string;
    displayName?: string;
    /** The account's verified address (`verifiedEmail`). */
    email?: string | null;
  },
): Promise<string> {
  if (invite) {
    const joined = await redeemInvite(supabase, invite, displayName);
    return joined ? joinedTreeHref(joined) : "/join?error=invite";
  }
  const { error } = await supabase.rpc("ensure_profile", {});
  // An alert email's button, opened while signed out, lands on its card.
  if (!error) return signInLanding(next);
  return (email ? await waitingInviteHref(email) : null) ?? PENDING_HREF;
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
    email: user ? verifiedEmail(user) : null,
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

/**
 * Whether an address already belongs to a member (`address_has_profile`,
 * service role only, Step 30.8), or `null` when the lookup fails. A lookup
 * and nothing more: no token minted, no email sent.
 */
export async function addressHasProfile(email: string): Promise<boolean | null> {
  const { data, error } = await createAdminClient().rpc("address_has_profile", {
    p_email: email,
  });
  if (error) return null;
  return data === true;
}

/**
 * Whether an emailed invite's page opens on "Email me a sign-in link"
 * instead of the accept form (Step 41.2): for someone signed out, when the
 * invite's address has an account already. Accepting would only find that
 * out and offer the link, after a privacy tick a member's join doesn't ask
 * for. The page is a GET that mail scanners open too, so this only looks
 * up; a failed lookup keeps the accept form, which asks again when tapped.
 * It tells the page nothing it didn't show before: the address is on it,
 * and accepting said the address has an account.
 */
export async function opensOnSignInLink(
  recipient: InviteRecipient | null,
  { signedIn }: { signedIn: boolean },
): Promise<boolean> {
  // Signed in, the page stays as it was: a member joins with one tap, and a
  // first-timer keeps the accept form (Step 30.8).
  if (!recipient || signedIn) return false;
  return (await addressHasProfile(recipient.email)) === true;
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
 * a member joins another tree from the invite page while signed in, and
 * `emailInviteSignInLink` sends one who isn't a link back to it.
 */
export async function signInWithInvite(token: string): Promise<InviteSignInResult> {
  const recipient = await getInviteRecipient(token);
  if (!recipient) return { ok: false, reason: "invalid" };

  // A member's address is refused before anything is minted for it: minting
  // a token stamps the account, and Supabase then won't email it the
  // sign-in link the invite page offers instead for a minute (Step 30.8).
  const member = await addressHasProfile(recipient.email);
  if (member === null) return { ok: false, reason: "failed" };
  if (member) return { ok: false, reason: "already_member" };

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

  // Checked again by the account itself, in case it became a member since.
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

export type InviteSignInLinkResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "failed" };

/**
 * An emailed invite opened by someone whose address already has an account
 * (Step 30.8, left over from 30.9): `signInWithInvite` won't sign them in on
 * the invite's say-so, so this emails that address an ordinary sign-in link
 * that lands back on the invite, signed in and a tap from joining, where
 * joining brings their own entry (Step 30.9). Only ever to the invite's own
 * address, and only to an account that exists already: a newcomer accepts
 * with the one button. No privacy tick: it's a plain sign-in (Step 30.4),
 * and a member's join button asks for none.
 */
export async function emailInviteSignInLink(
  token: string,
): Promise<InviteSignInLinkResult> {
  const recipient = await getInviteRecipient(token);
  if (!recipient) return { ok: false, reason: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: recipient.email,
    options: {
      emailRedirectTo: signInCallbackUrl(getSiteUrl(), { next: inviteHref(token) }),
      shouldCreateUser: false,
    },
  });
  if (error) return { ok: false, reason: "failed" };
  return { ok: true, email: recipient.email };
}
