import "server-only";

import type { Profile } from "@/lib/auth";
import { founderApprovedEmail } from "@/lib/emails/founder-approved";
import { founderInviteEmail } from "@/lib/emails/founder-invite";
import {
  mintInvites,
  type InviteRecipient,
  type MintedInvite,
} from "@/lib/invite-mint.server";

/**
 * Mint founder invites (Step 25) on `treeId`, attributed to `inviter`, each
 * bound to its recipient's address, and email them. Redeeming one plants a
 * fresh tree with them as its Root.
 *
 * `source` says how they started, and so which email goes: a Root sending
 * them unasked (`direct`), or a beta reviewer approving a waitlist sign-up
 * (`request`, Step 28). Either way a "Sent invites" record is kept on
 * `treeId`, so each can be resent or killed from there.
 *
 * The caller must already have checked that `inviter` is a Root of
 * `treeId`: binding an address takes a Root or the service role
 * (`invites_guard`), and this writes with the service role. Not a server
 * action — keep it out of "use server" files.
 */
export function mintFounderInvites(
  treeId: string,
  inviter: Profile,
  recipients: InviteRecipient[],
  source: "direct" | "request",
): Promise<MintedInvite[]> {
  const founderEmail = source === "direct" ? founderInviteEmail : founderApprovedEmail;
  return mintInvites({
    treeId,
    inviter,
    recipients,
    foundsTree: true,
    source,
    email: (recipient, { url, inviterName }) =>
      founderEmail({ firstName: recipient.firstName, inviterName, url }),
  });
}
