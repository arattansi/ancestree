import { claimInviteEmail } from "@/lib/emails/claim-invite";
import { inviteApprovedEmail } from "@/lib/emails/invite-approved";
import { inviteSentEmail } from "@/lib/emails/invite-sent";

/**
 * The email an invite into a tree goes out with again: resent from Sent
 * Invites, or renewed from its expired link (Step 163). It keeps the first
 * one's wording: nobody asked for a direct invite, so it never says a
 * request was approved, and an invite naming an entry names it again — a
 * request approved as one (Step 30.3), or one sent from the entry's card
 * (Step 38). A founder invite isn't one of these.
 */
export function treeInviteEmail(input: {
  /** Its "Sent invites" record's: `request` for an approved request. */
  source: string | null;
  firstName: string;
  inviterName: string;
  treeName: string;
  url: string;
  entryName: string | null;
  placeholder?: boolean;
}): { subject: string; html: string } {
  const { source, entryName, placeholder, ...sent } = input;
  if (source === "request") return inviteApprovedEmail({ ...sent, entryName });
  return entryName
    ? claimInviteEmail({ ...sent, entryName, placeholder })
    : inviteSentEmail(sent);
}
