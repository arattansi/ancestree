import "server-only";

import { accountTypeOf, INVITED_AS } from "@/lib/account-types";
import type { Profile } from "@/lib/auth";
import { claimInviteRecordName } from "@/lib/claim-invites";
import { sendEmail } from "@/lib/email";
import { isEmailAddress } from "@/lib/email-address";
import { claimInviteEmail } from "@/lib/emails/claim-invite";
import { expiresAfter } from "@/lib/expiry";
import { INVITE_LIFETIME_DAYS } from "@/lib/limits";
import { personDisplayName } from "@/lib/person-name";
import { isPlacedOn } from "@/lib/placements.server";
import { inviteHref } from "@/lib/sign-in-links";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getRoleIn } from "@/lib/tree-context";

export type ClaimInviteState = {
  /** The address the link went to, for the confirmation message. */
  email?: string;
  /**
   * The invite was made. It stands even when its email didn't send (then
   * `error` says so), and a relayed ask is answered by it (Step 41.1).
   */
  minted?: boolean;
  error?: string;
};

/**
 * Make and email an invite for one specific unclaimed entry — the work of
 * `sendClaimInvite` (app/actions/invites.ts), which is where the rules are
 * told, without redrawing the page: an action that does more after it, like
 * adding a relative with it (Step 77.5), redraws once, at its end.
 *
 * The checks that need only the entry run side by side: who may join which
 * tree, whether it's placed there, whether the inviter may hand it over, and
 * whether someone has it already.
 */
export async function mintClaimInvite(
  inviter: Profile,
  personId: string,
  email: string,
  treeId?: string,
): Promise<ClaimInviteState> {
  const address = email.trim().toLowerCase();
  if (!isEmailAddress(address)) {
    return { error: "That doesn't look like an email address." };
  }
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("people")
    .select("id, tree_id, first_name, preferred_name, last_name, owner_user_id, created_by")
    .eq("id", personId)
    .maybeSingle();

  if (!person) return { error: "That entry no longer exists." };

  // The tree they'll join: the entry's home, or another it's placed on.
  const joinTreeId = treeId ?? person.tree_id;
  const [role, placed, { data: mayInvite }, { data: claim }, { data: member }] =
    await Promise.all([
      getRoleIn(joinTreeId),
      joinTreeId === person.tree_id ? true : isPlacedOn(joinTreeId, personId),
      // Asked as the inviter: is this entry theirs to hand over? It also
      // covers the entry having gone, or being out of their sight.
      supabase.rpc("can_invite_to_claim", { p_person_id: personId }),
      // Refuse on anything already spoken for, so an invite can never be
      // used to hand someone else's entry away. Mirrors `claim_person`.
      supabase
        .from("claims")
        .select("id")
        .eq("person_id", personId)
        .eq("status", "approved")
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("auth_user_id")
        .eq("self_person_id", personId)
        .maybeSingle(),
    ]);

  if (!role) {
    return { error: "You don't have permission to send invites for this entry." };
  }
  if (!placed) return { error: "That entry isn't on that tree." };
  if (claim || member || person.owner_user_id !== person.created_by) {
    return { error: "That entry already belongs to a member." };
  }
  if (mayInvite !== true) {
    return {
      error:
        "You can invite someone to claim only an entry you can edit. Ask a Root to send this one.",
    };
  }

  // Bound to the address, so opening it signs them straight in. Only a Root
  // or the service role may bind one (`invites_guard`), hence the service-role
  // write, as in `sendDirectInvites`: the inviter's right was checked above.
  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("invites")
    .insert({
      tree_id: joinTreeId,
      created_by: inviter.auth_user_id,
      status: "active",
      expires_at: expiresAfter(INVITE_LIFETIME_DAYS),
      joins_as: INVITED_AS.key,
      person_id: personId,
      invited_email: address,
    })
    .select("id, token")
    .single();

  if (error || !invite) {
    return { error: "Could not create an invite link. Try again." };
  }

  const entryName = personDisplayName(person);
  const { subject, html } = claimInviteEmail({
    firstName: person.preferred_name || person.first_name || entryName,
    entryName,
    inviterName: inviter.display_name ?? "A family member",
    url: `${getSiteUrl()}${inviteHref(invite.token)}`,
  });
  const sent = await sendEmail({ to: address, subject, html });

  // Its "Sent invites" record, as a direct invite keeps (Step 38): without
  // one the Roots never saw it in the Root console, where it can be resent
  // or deleted. Named after the entry, the only name the card asks for.
  // Best-effort, as there: the invite is valid either way, and the entry's
  // card shows it from the invite itself.
  await admin.from("invite_requests").insert({
    tree_id: joinTreeId,
    ...claimInviteRecordName(person),
    email: address,
    source: "direct",
    status: "approved",
    reviewed_by: inviter.auth_user_id,
    reviewed_at: new Date().toISOString(),
    invite_id: invite.id,
    email_sent: sent.ok,
  });

  if (!sent.ok) {
    return {
      minted: true,
      error: accountTypeOf(role).runsTree
        ? "The invite was created but the email didn't send. Resend it from Sent Invites in the Root console."
        : "The invite was created but the email didn't send. Try again in a moment.",
    };
  }

  return { email: address, minted: true };
}
