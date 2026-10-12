import "server-only";

import { accountTypeOf, INVITED_AS } from "@/lib/account-types";
import type { Profile } from "@/lib/auth";
import { claimInviteRecordName } from "@/lib/claim-invites";
import { isEmailAddress } from "@/lib/email-address";
import { claimInviteEmail } from "@/lib/emails/claim-invite";
import { expiresAfter } from "@/lib/expiry";
import { inviteUrl, mintInvites } from "@/lib/invite-mint.server";
import { INVITE_LIFETIME_DAYS } from "@/lib/limits";
import { personDisplayName } from "@/lib/person-name";
import { isPlacedOn } from "@/lib/placements.server";
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

/** What an invite needs of the entry it names: who it's for, and its home. */
type InvitedEntry = {
  tree_id: string;
  first_name: string | null;
  preferred_name: string | null;
  last_name: string;
  /** A placeholder child's number (Step 98.3): its invite names "First Child". */
  placeholder_number?: number | null;
  /**
   * Whether the entry itself could be read. Not for a basic card (Step 80):
   * its tree shows a name and keeps the rest back, the inviter included.
   */
  readable: boolean;
  /** Someone is behind it already, as far as the inviter can see. */
  spokenFor: boolean;
};

/**
 * The entry as the inviter may read it, or failing that the card `treeId`
 * shows of it (Step 84): a Root inviting someone to claim a basic card knows
 * its name, which is all an invite says.
 */
async function readInvitedEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  treeId: string | undefined,
): Promise<InvitedEntry | null> {
  const { data: person } = await supabase
    .from("people")
    .select(
      "id, tree_id, first_name, preferred_name, last_name, owner_user_id, created_by, placeholder_number",
    )
    .eq("id", personId)
    .maybeSingle();
  if (person) {
    return {
      tree_id: person.tree_id,
      first_name: person.first_name,
      preferred_name: person.preferred_name,
      last_name: person.last_name,
      placeholder_number: person.placeholder_number,
      readable: true,
      spokenFor: person.owner_user_id !== person.created_by,
    };
  }
  if (!treeId) return null;

  const { data: card } = await supabase
    .from("tree_people")
    .select("id, home_tree_id, first_name, preferred_name, last_name")
    .eq("tree_id", treeId)
    .eq("id", personId)
    .eq("detail", "basic")
    .maybeSingle();
  if (!card?.home_tree_id || !card.last_name) return null;
  return {
    tree_id: card.home_tree_id,
    first_name: card.first_name,
    preferred_name: card.preferred_name,
    last_name: card.last_name,
    readable: false,
    spokenFor: false,
  };
}

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

  const person = await readInvitedEntry(supabase, personId, treeId);
  if (!person) return { error: "That entry no longer exists." };

  // The tree they'll join: the entry's home, or another it's placed on.
  const joinTreeId = treeId ?? person.tree_id;
  const [role, placed, { data: mayInvite }, { data: claim }, { data: member }] =
    await Promise.all([
      getRoleIn(joinTreeId),
      joinTreeId === person.tree_id ? true : isPlacedOn(joinTreeId, personId),
      // Asked as the inviter: is this entry theirs to hand over, into this
      // tree (Step 84)? It also covers the entry having gone, being out of
      // their sight, or spoken for where they can't see.
      supabase.rpc("can_invite_to_claim_on", {
        p_tree: joinTreeId,
        p_person_id: personId,
      }),
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
  if (claim || member || person.spokenFor) {
    return { error: "That entry already belongs to a member." };
  }
  if (mayInvite !== true) {
    // Why is the home tree's to know, when all this tree shows is a name.
    if (!person.readable) {
      return {
        error: accountTypeOf(role).runsTree
          ? "That entry can’t be claimed."
          : "Only a Root can invite someone to claim this entry.",
      };
    }
    return {
      error:
        "You can invite someone to claim only an entry you can edit. Ask a Root to send this one.",
    };
  }

  // Bound to the address and filed in "Sent invites", as a direct invite
  // is (`mintInvites`): the inviter's right was checked above. The record is
  // named after the entry, the only name the card asks for (Step 38).
  const entryName = personDisplayName(person);
  const recordName = claimInviteRecordName(person);
  const [invite] = await mintInvites({
    treeId: joinTreeId,
    inviter,
    recipients: [
      { firstName: recordName.first_name, lastName: recordName.last_name, email: address },
    ],
    personId,
    source: "direct",
    email: (_, { url, inviterName }) =>
      claimInviteEmail({
        firstName: person.preferred_name || person.first_name || entryName,
        entryName,
        inviterName,
        url,
        placeholder: person.placeholder_number != null,
      }),
  });

  if (!invite.inviteId) {
    return { error: "Could not create an invite link. Try again." };
  }
  if (!invite.emailed) {
    return {
      minted: true,
      error: accountTypeOf(role).runsTree
        ? "The invite was created but the email didn't send. Resend it from Sent Invites in the Root console."
        : "The invite was created but the email didn't send. Try again in a moment.",
    };
  }

  return { email: address, minted: true };
}

/**
 * A link to claim one entry, for a Root to send however they like (Step
 * 143): bound to no address, so whoever opens it may join `treeId` and
 * claim the entry, once (`redeem_invite`). The Root console's list makes
 * one beside each name. A link still live for the entry, bare like this
 * one, is handed back rather than a second made.
 */
export async function mintClaimLink(
  inviter: Profile,
  personId: string,
  treeId: string,
): Promise<{ url?: string; minted?: boolean; error?: string }> {
  const supabase = await createClient();
  const [role, { data: mayInvite }] = await Promise.all([
    getRoleIn(treeId),
    supabase.rpc("can_invite_to_claim_on", {
      p_tree: treeId,
      p_person_id: personId,
    }),
  ]);
  if (!role || !accountTypeOf(role).runsTree) {
    return { error: "Only a Root of this tree can make that link." };
  }
  if (mayInvite !== true) return { error: "That entry can’t be claimed." };

  // Bound to nobody: the service role reads and makes it, the right to
  // having been checked above.
  const admin = createAdminClient();
  const { data: live } = await admin
    .from("invites")
    .select("token")
    .eq("tree_id", treeId)
    .eq("person_id", personId)
    .eq("status", "active")
    .eq("founds_tree", false)
    .is("invited_email", null)
    .is("max_uses", null)
    .is("archived_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live) return { url: inviteUrl(live.token) };

  const { data: made, error } = await admin
    .from("invites")
    .insert({
      tree_id: treeId,
      created_by: inviter.auth_user_id,
      status: "active",
      expires_at: expiresAfter(INVITE_LIFETIME_DAYS),
      joins_as: INVITED_AS.key,
      person_id: personId,
    })
    .select("token")
    .single();
  if (error || !made) {
    console.error(`[invites] claim link not made — ${error?.message}`);
    return { error: "Could not create a link. Try again." };
  }
  return { url: inviteUrl(made.token), minted: true };
}
