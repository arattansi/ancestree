import "server-only";

import { INVITED_AS } from "@/lib/account-types";
import type { Profile } from "@/lib/auth";
import { sendEmails, unsentSummary, whyNotSent } from "@/lib/email";
import { expiresAfter } from "@/lib/expiry";
import { INVITE_LIFETIME_DAYS } from "@/lib/limits";
import { inviteHref } from "@/lib/sign-in-links";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

/** Who an invite is for: the name its record keeps, and its address. */
export type InviteRecipient = {
  firstName: string;
  lastName: string;
  /** Checked and lower-cased, and no two alike. */
  email: string;
};

export type MintedInvite = {
  email: string;
  /** Null when the invite itself couldn't be made: nothing was sent. */
  inviteId: string | null;
  url: string | null;
  emailed: boolean;
  /** Why it didn't go, when there's something to say. */
  error?: string;
};

/** What an invite's email says, given its link and who sent it. */
export type InviteEmail = (
  recipient: InviteRecipient,
  sent: { url: string; inviterName: string },
) => { subject: string; html: string };

/** An invite's link, as its email carries it. */
export function inviteUrl(token: string): string {
  return `${getSiteUrl()}${inviteHref(token)}`;
}

/** How an invite's email names whoever sent it. */
export function inviterName(inviter: Pick<Profile, "display_name">): string {
  return inviter.display_name ?? "A family member";
}

const NOT_MADE = "Could not create a link.";

/**
 * Invites for several people at once (Step 77.5, audit S8): made together,
 * emailed together and filed together in the tree's "Sent invites" — three
 * round trips however many there are, where each person took three.
 *
 * Each is bound to its address, so opening it signs them straight in
 * (`signInWithInvite`). Only a Root or the service role may bind one
 * (`invites_guard`), hence the service role here: the caller has checked
 * that the inviter may send them, and a link goes only to its recipient's
 * inbox. The record is best-effort: an invite is valid without it, and a
 * claim invite's card shows it from the invite itself.
 */
export async function mintInvites({
  treeId,
  inviter,
  recipients,
  personId,
  foundsTree = false,
  source,
  email,
}: {
  treeId: string;
  inviter: Profile;
  recipients: InviteRecipient[];
  /** The entry accepting one claims (Step 38); for a single recipient. */
  personId?: string;
  /** Accepting one plants a tree of their own (Step 25). */
  foundsTree?: boolean;
  /** Sent unasked, or answering a request (Step 28). */
  source: "direct" | "request";
  email: InviteEmail;
}): Promise<MintedInvite[]> {
  if (recipients.length === 0) return [];
  const admin = createAdminClient();
  const expiresAt = expiresAfter(INVITE_LIFETIME_DAYS);

  const { data: invites, error } = await admin
    .from("invites")
    .insert(
      recipients.map((r) => ({
        tree_id: treeId,
        created_by: inviter.auth_user_id,
        status: "active",
        expires_at: expiresAt,
        joins_as: INVITED_AS.key,
        founds_tree: foundsTree,
        person_id: personId ?? null,
        invited_email: r.email,
      })),
    )
    .select("id, token, invited_email");
  if (error || !invites) {
    console.error(`[invites] ${recipients.length} invites not made — ${error?.message}`);
    return recipients.map((r) => ({
      email: r.email,
      inviteId: null,
      url: null,
      emailed: false,
      error: NOT_MADE,
    }));
  }

  const key = (address: string | null) => address?.trim().toLowerCase();
  const byAddress = new Map(invites.map((invite) => [key(invite.invited_email), invite]));
  const made = recipients.flatMap((recipient) => {
    const invite = byAddress.get(key(recipient.email));
    return invite ? [{ recipient, invite, url: inviteUrl(invite.token) }] : [];
  });

  const from = inviterName(inviter);
  const sent = await sendEmails(
    made.map(({ recipient, url }) => ({
      to: recipient.email,
      ...email(recipient, { url, inviterName: from }),
    })),
  );
  const unsent = unsentSummary(sent);
  if (unsent) console.error(`[invites] invite emails: ${unsent}`);

  const reviewedAt = new Date().toISOString();
  const { error: recordError } = await admin.from("invite_requests").insert(
    made.map(({ recipient, invite }, i) => ({
      tree_id: treeId,
      first_name: recipient.firstName,
      last_name: recipient.lastName,
      email: recipient.email,
      source,
      status: "approved",
      reviewed_by: inviter.auth_user_id,
      reviewed_at: reviewedAt,
      invite_id: invite.id,
      email_sent: sent[i].ok,
    })),
  );
  if (recordError) {
    console.error(`[invites] ${made.length} invites made but not recorded — ${recordError.message}`);
  }

  const minted = new Map(
    made.map(({ recipient, invite, url }, i) => [
      recipient.email,
      {
        email: recipient.email,
        inviteId: invite.id,
        url,
        emailed: sent[i].ok,
        error: whyNotSent(sent[i]),
      },
    ]),
  );
  return recipients.map(
    (r) =>
      minted.get(r.email) ?? {
        email: r.email,
        inviteId: null,
        url: null,
        emailed: false,
        error: NOT_MADE,
      },
  );
}
