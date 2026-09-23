"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { sendEmail } from "@/lib/email";
import { claimInviteEmail } from "@/lib/emails/claim-invite";
import { founderApprovedEmail } from "@/lib/emails/founder-approved";
import { founderInviteEmail } from "@/lib/emails/founder-invite";
import { inviteApprovedEmail } from "@/lib/emails/invite-approved";
import { inviteSentEmail } from "@/lib/emails/invite-sent";
import { personDisplayName } from "@/lib/person-name";
import { chosenCandidate } from "@/lib/request-candidates";
import { getRequestCandidates } from "@/lib/request-candidates.server";
import {
  problemState,
  readNameAndEmail,
  type RequestFormState,
} from "@/lib/request-forms";
import { alertRootsOfAccessRequest } from "@/lib/request-alerts.server";
import type { SelfCandidate } from "@/lib/self-match";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreePages } from "@/lib/revalidate";
import { getUser, requireProfile } from "@/lib/auth";
import { rootOf } from "@/lib/tree-context";

const INVITE_TTL_DAYS = 14;

export type RequestInviteState = RequestFormState & { ok?: boolean };

/**
 * Public: ask a tree's Roots for an invite. Written with the service-role
 * client because the requester is not signed in and `invite_requests` is not
 * reachable from `anon`. `tree` names the tree by its slug: from a share
 * link's "Ask to join" dialog (Step 41.4), or from the tree the request-access
 * search found them on (`findFamilyTree`, Step 28). There's no default tree any
 * more — with several families on the site, a request without one would be
 * guessing whose it is. A new request emails the tree's Roots once the
 * requester has their answer (Step 30.1); asking again emails nobody.
 */
export async function requestInvite(
  _prev: RequestInviteState,
  formData: FormData,
): Promise<RequestInviteState> {
  const { entered, problem } = readNameAndEmail(formData);
  const consent = formData.get("consent");
  const treeSlug = String(formData.get("tree") ?? "").trim();

  if (problem) return problemState(problem, entered);
  // Approval leads straight into the tree, so this is where they agree to it.
  if (consent !== "on" && consent !== "true") {
    return { error: "Please accept the privacy notice to continue.", ...entered };
  }
  if (!treeSlug) {
    return { error: "Find your family’s tree first, then ask to join it.", ...entered };
  }

  const supabase = createAdminClient();
  const { data: tree } = await supabase
    .from("trees")
    .select("id, name")
    .eq("slug", treeSlug)
    .maybeSingle();
  if (!tree) {
    return { error: "That tree isn't taking requests. Ask the person who shared it with you.", ...entered };
  }

  const { error } = await supabase.from("invite_requests").insert({
    tree_id: tree.id,
    first_name: entered.firstName,
    last_name: entered.lastName,
    email: entered.email,
  });

  if (error) {
    // Unique violation on the pending-email index: they already asked.
    if (error.code === "23505") return { ok: true, ...entered };
    return { error: "Could not send your request. Try again shortly.", ...entered };
  }

  // After the response, so the email never slows or fails the form.
  after(() =>
    alertRootsOfAccessRequest({
      treeId: tree.id,
      treeName: tree.name,
      firstName: entered.firstName,
      lastName: entered.lastName,
    }),
  );
  // Only someone signed in has a page showing their request: /join says
  // where it stands (Step 30.8). Anyone else's page would be drawn again for
  // nothing, and a share link's canvas, behind its "Ask to join" dialog,
  // would re-measure every card (Step 41.4).
  if (await getUser()) revalidateTreePages();
  return { ok: true, ...entered };
}

/**
 * Root: approve a request by minting a single-use invite link into its tree,
 * attributed to the reviewing Root, then emailing it to the requester. The
 * invite is bound to their address, so opening it signs them in and joins the
 * tree in one step (`signInWithInvite`) — no second sign-in email. The link
 * is also returned so the Root can copy it as a fallback — if the email fails
 * to send, `emailError` is set but the approval itself is not rolled back;
 * the invite is already valid either way.
 *
 * With `personId` the Root approves them as that entry (Step 30.3): the
 * invite names it (`person_id`), so accepting claims it and lands them on it
 * (Step 30.2), and the email says whose entry it is. It has to be one of the
 * entries the request's name matches, asked again here rather than taken on
 * the browser's word.
 */
export async function approveInviteRequest(
  id: string,
  personId?: string | null,
): Promise<{
  url?: string;
  emailed?: boolean;
  emailError?: string;
  /** The entry the invite claims, when approved as one. */
  entryName?: string;
  error?: string;
}> {
  const admin = await requireProfile();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("invite_requests")
    .select("id, status, first_name, email, tree_id")
    .eq("id", id)
    .maybeSingle();

  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "pending") {
    return { error: "That request has already been reviewed." };
  }
  const { error: notRoot } = await rootOf(request.tree_id);
  if (notRoot) return { error: notRoot };

  let entry: SelfCandidate | null = null;
  if (personId) {
    const candidates = await getRequestCandidates(request.id);
    if (!candidates) return { error: "Couldn't check that entry. Try again." };
    entry = chosenCandidate(candidates, personId);
    if (!entry) {
      return {
        error:
          "Their name no longer matches that entry, or someone has claimed it. Reload to see who’s left.",
      };
    }
  }

  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .insert({
      tree_id: request.tree_id,
      created_by: admin.auth_user_id,
      status: "active",
      expires_at: expiresAt,
      // The link signs this address in — see `signInWithInvite`.
      invited_email: request.email.trim().toLowerCase(),
      // Accepting claims this entry (Step 30.2); `invites_guard` lets a Root.
      person_id: entry?.id ?? null,
    })
    .select("id, token")
    .single();

  if (inviteError || !invite) {
    return { error: "Could not create an invite link. Try again." };
  }

  const url = `${getSiteUrl()}/join/${invite.token}`;
  const { subject, html } = inviteApprovedEmail({
    firstName: request.first_name,
    inviterName: admin.display_name ?? "A family member",
    url,
    entryName: entry?.name,
  });
  const sent = await sendEmail({ to: request.email, subject, html });

  const { error: updateError } = await supabase
    .from("invite_requests")
    .update({
      status: "approved",
      reviewed_by: admin.auth_user_id,
      reviewed_at: new Date().toISOString(),
      invite_id: invite.id,
      email_sent: sent.ok,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (updateError) {
    return { error: "Could not update that request. Try again." };
  }

  revalidateTreePages();
  return {
    url,
    emailed: sent.ok,
    emailError: sent.ok ? undefined : sent.error,
    entryName: entry?.name,
  };
}

/**
 * Root: send the invite email again for an already-approved request — the
 * recovery path when the first send failed (a bounce, or no mail provider
 * configured at the time) or the recipient simply lost it.
 *
 * Deliberately reuses the invite minted at approval instead of creating a
 * fresh one: any link already in the wild keeps working, and the 14-day
 * clock is not quietly reset. That also means an expired invite can't be
 * revived here — delete the record and invite them again.
 */
export async function resendInviteEmail(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const admin = await requireProfile();
  const supabase = await createClient();

  // RLS shows a request only to a Root of its tree, and them the entry an
  // approval named (Step 30.3), which is on that tree.
  const { data: request } = await supabase
    .from("invite_requests")
    .select(
      "id, status, source, first_name, email, invites(token, status, expires_at, founds_tree, people(first_name, preferred_name, last_name))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "approved") {
    return { error: "Only an approved request has an invite to resend." };
  }

  // One-to-one FK that PostgREST still hands back as an array.
  const invite = Array.isArray(request.invites)
    ? request.invites[0]
    : request.invites;

  if (!invite) return { error: "That approval never minted an invite link." };
  if (invite.status === "accepted") {
    return { error: "They have already joined — there is nothing left to send." };
  }
  if (invite.status !== "active") {
    return { error: "That invite link has been revoked." };
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return {
      error: "That invite link has expired. Delete it and invite them again.",
    };
  }

  const inviterName = admin.display_name ?? "A family member";
  const url = `${getSiteUrl()}/join/${invite.token}`;
  // Keep the original wording: nobody asked for a direct invite, so it must
  // not come back claiming their request was approved; a founder invite
  // starts a tree of their own, so it must not read as joining this one; and
  // an invite naming an entry names it again — a request approved as one
  // (Step 30.3), or one sent from the entry's card (Step 38).
  const input = { firstName: request.first_name, inviterName, url };
  const direct = request.source === "direct";
  const entry = invite.people;
  const entryName = entry ? personDisplayName(entry) : null;
  const { subject, html } = invite.founds_tree
    ? direct
      ? founderInviteEmail(input)
      : founderApprovedEmail(input)
    : direct
      ? entryName
        ? claimInviteEmail({ ...input, entryName })
        : inviteSentEmail(input)
      : inviteApprovedEmail({ ...input, entryName });

  const sent = await sendEmail({ to: request.email, subject, html });

  const { error: updateError } = await supabase
    .from("invite_requests")
    .update({ email_sent: sent.ok })
    .eq("id", id);

  revalidateTreePages();

  if (!sent.ok) return { error: `Still couldn't send it — ${sent.error}` };
  if (updateError) {
    return { error: "Email sent, but the record still shows it as failed." };
  }
  return { ok: true };
}

/** Root: decline a request without minting anything. */
export async function declineInviteRequest(
  id: string,
): Promise<{ error?: string }> {
  const admin = await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invite_requests")
    .update({
      status: "declined",
      reviewed_by: admin.auth_user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) return { error: "Could not decline that request. Try again." };
  if (!data || data.length === 0) {
    return { error: "That request was already reviewed, or isn't yours to review." };
  }

  revalidateTreePages();
  return {};
}

/**
 * Root: erase an invite record outright — both a pending request in the
 * review queue and a reviewed one in the sent-invites history.
 *
 * If approving it minted a link, that invite goes too, so a link that hasn't
 * been used yet stops working. `invite_requests.invite_id` is `on delete set
 * null`, so the invite would otherwise outlive the record that names it.
 * Who-invited-whom is unaffected: `profiles.invited_by_user_id` points at the
 * inviter's profile, not at the invite row.
 */
export async function deleteInviteRequest(
  id: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("invite_requests")
    .select("id, invite_id")
    .eq("id", id)
    .maybeSingle();

  // Already gone — someone else deleted it. Nothing left to do.
  if (!request) {
    revalidateTreePages();
    return {};
  }

  const { error } = await supabase.from("invite_requests").delete().eq("id", id);
  if (error) return { error: "Could not delete that record. Try again." };

  if (request.invite_id) {
    const { error: inviteError } = await supabase
      .from("invites")
      .delete()
      .eq("id", request.invite_id);
    if (inviteError) {
      revalidateTreePages();
      return { error: "Record deleted, but its invite link is still live." };
    }
  }

  revalidateTreePages();
  revalidatePath("/account");
  return {};
}
