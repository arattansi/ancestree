"use server";

import { after } from "next/server";

import { requireProfile } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { treeRequestApprovedEmail } from "@/lib/emails/tree-request-approved";
import { mintFounderInvite } from "@/lib/founder-invites.server";
import { CONSENT_NEEDED, consentGiven } from "@/lib/privacy-consent";
import {
  problemState,
  readNameAndEmail,
  type RequestFormState,
} from "@/lib/request-forms";
import { askedAfresh } from "@/lib/request-alerts";
import { alertReviewersOfTreeRequest } from "@/lib/request-alerts.server";
import { revalidateTreePages } from "@/lib/revalidate";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rootOf } from "@/lib/tree-context";
import { newTreeHref } from "@/lib/tree-links";
import { toTreeRequestStatus, type TreeRequestStatus } from "@/lib/tree-requests";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/**
 * A signed-in member asks to start a tree of their own (Step 28). During the
 * beta a new tree is by request (`found_tree` refuses anyone a reviewer
 * hasn't approved); asking again changes nothing. Answers where the ask
 * stands afterwards, so someone approved in the meantime can go straight on.
 * A new ask emails the beta reviewers (Step 30.1). `request_tree` answers
 * "pending" to a repeat too, so where the ask stood before tells them apart.
 */
export async function requestNewTree(): Promise<{
  status?: TreeRequestStatus;
  error?: string;
}> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: before } = await supabase.rpc("my_tree_request");
  const { data, error } = await supabase.rpc("request_tree");
  if (error) return { error: "Couldn't send your request. Try again." };
  const status = toTreeRequestStatus(data);
  if (askedAfresh(before, status)) {
    after(() =>
      alertReviewersOfTreeRequest({ kind: "member", userId: profile.auth_user_id }),
    );
  }
  revalidateTreePages();
  return { status };
}

export type WaitlistState = RequestFormState & { ok?: boolean };

/**
 * Public: join the waitlist to start a tree (Step 28). Written with the
 * service role, because the person isn't signed in and `tree_requests` isn't
 * reachable from anon. A reviewer answers with a founder invite by email.
 * A new sign-up emails the reviewers once the person has their answer (Step
 * 30.1); signing up again emails nobody.
 *
 * It needs the privacy agreement (Step 30.6): the founder invite is filed
 * as a request (`mintFounderInvite`), and the join page skips the box for a
 * request, taking it as ticked when they asked.
 */
export async function joinBetaWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const { entered, problem } = readNameAndEmail(formData);
  if (problem) return problemState(problem, entered);
  if (!consentGiven(formData)) return { error: CONSENT_NEEDED, ...entered };

  const { error } = await createAdminClient().from("tree_requests").insert({
    first_name: entered.firstName,
    last_name: entered.lastName,
    email: entered.email,
  });
  if (error) {
    // The pending-address index: they're on the list already.
    if (error.code === "23505") return { ok: true, ...entered };
    return { error: "Couldn't add you to the waitlist. Try again shortly.", ...entered };
  }

  // After the response, so the email never slows or fails the form.
  after(() =>
    alertReviewersOfTreeRequest({
      kind: "waitlist",
      firstName: entered.firstName,
      lastName: entered.lastName,
    }),
  );
  revalidateTreePages();
  return { ok: true, ...entered };
}

export type FoundTree = { name: string; slug: string };

export type FindTreeState = RequestFormState & {
  /** Set once a search has run: each tree showing someone by that name. */
  found?: FoundTree[];
};

/**
 * Public: look for someone's family tree before they ask to join it (Step
 * 26). Only strong matches on living entries nobody has claimed count
 * (`trees_matching_name`), and only the trees come back: what the person
 * learns is that a tree has someone by their name, never who. The address
 * isn't searched; it's checked here so the next step can use it.
 */
export async function findFamilyTree(
  _prev: FindTreeState,
  formData: FormData,
): Promise<FindTreeState> {
  const { entered, problem } = readNameAndEmail(formData);
  if (problem) return problemState(problem, entered);

  const { data, error } = await createAdminClient().rpc("trees_matching_name", {
    p_first: entered.firstName,
    p_last: entered.lastName,
  });
  if (error) {
    return { error: "Couldn't search just now. Try again shortly.", ...entered };
  }

  const found = (data ?? []).flatMap((t) =>
    t.tree_name && t.tree_slug ? [{ name: t.tree_name, slug: t.tree_slug }] : [],
  );
  return { found, ...entered };
}

export type ApproveTreeRequestResult = {
  emailed?: boolean;
  emailError?: string;
  error?: string;
};

/**
 * Reviewer: say yes to a request to start a tree (Step 28).
 *
 * A member may then found one: the database puts it in their inbox
 * (`tree_request_notify`) and this emails them. Someone from the waitlist
 * has no account, so they get a founder invite instead, minted on `treeId`
 * — a tree the reviewer runs, whose "Sent invites" keeps the record and can
 * resend it if the email doesn't go.
 */
export async function approveTreeRequest(
  id: string,
  treeId: string,
): Promise<ApproveTreeRequestResult> {
  const reviewer = await requireProfile();
  if (!(await isBetaReviewer())) {
    return { error: "Only a beta reviewer can answer requests to start a tree." };
  }
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("tree_requests")
    .select("id, user_id, first_name, last_name, email, status")
    .eq("id", id)
    .maybeSingle();
  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "pending") {
    return { error: "That request has already been answered." };
  }

  // A founder invite is minted on a tree the reviewer runs.
  const root = request.user_id ? null : await rootOf(treeId);
  if (root && (root.error || !root.membership)) {
    return { error: root.error ?? "Approve it from the admin console of a tree you run." };
  }

  // Answer it before acting on it, so a second press can't send twice.
  const { data: claimed, error: claimError } = await supabase
    .from("tree_requests")
    .update({
      status: "approved",
      reviewed_by: reviewer.auth_user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (claimError) return { error: "Couldn't approve that request. Try again." };
  if (!claimed || claimed.length === 0) {
    return { error: "That request has already been answered." };
  }

  if (request.user_id) {
    const { subject, html } = treeRequestApprovedEmail({
      firstName: request.first_name,
      reviewerName: reviewer.display_name ?? "The ancestree team",
      url: `${getSiteUrl()}${newTreeHref()}`,
    });
    const sent = await sendEmail({ to: request.email, subject, html });
    await supabase.from("tree_requests").update({ email_sent: sent.ok }).eq("id", id);
    revalidateTreePages();
    return { emailed: sent.ok, emailError: sent.ok ? undefined : sent.error };
  }

  const minted = await mintFounderInvite(
    treeId,
    root!.membership!.profile,
    {
      firstName: request.first_name,
      lastName: request.last_name,
      email: request.email,
    },
    "request",
  );
  if (!minted.inviteId) {
    // Nothing went out: put it back in the queue.
    await supabase
      .from("tree_requests")
      .update({ status: "pending", reviewed_by: null, reviewed_at: null })
      .eq("id", id);
    return { error: "Couldn't create their founder invite. Try again." };
  }

  await supabase
    .from("tree_requests")
    .update({ invite_id: minted.inviteId, email_sent: minted.emailed })
    .eq("id", id);
  revalidateTreePages();
  return { emailed: minted.emailed, emailError: minted.error };
}

/** Reviewer: say no, keeping a record. They can ask again. */
export async function declineTreeRequest(id: string): Promise<{ error?: string }> {
  const reviewer = await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tree_requests")
    .update({
      status: "declined",
      reviewed_by: reviewer.auth_user_id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) return { error: "Couldn't decline that request. Try again." };
  if (!data || data.length === 0) {
    return { error: "That request was already answered, or isn't yours to answer." };
  }

  revalidateTreePages();
  return {};
}

/**
 * Reviewer: erase a request outright. Unlike declining it leaves no record,
 * so they can ask again. For a member already approved it takes the
 * permission back, if they haven't started their tree yet; a waitlist
 * approval's founder invite goes with it, so an unused link stops working.
 */
export async function deleteTreeRequest(id: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("tree_requests")
    .select("id, invite_id")
    .eq("id", id)
    .maybeSingle();
  // Already gone. Nothing left to do.
  if (!request) {
    revalidateTreePages();
    return {};
  }

  const { data, error } = await supabase
    .from("tree_requests")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: "Couldn't delete that request. Try again." };
  if (!data || data.length === 0) {
    return { error: "Only a beta reviewer can delete requests to start a tree." };
  }

  if (request.invite_id) {
    // As `deleteInvite`: the "Sent invites" record, then the link. RLS holds
    // both to a Root of the tree it was minted on.
    await supabase.from("invite_requests").delete().eq("invite_id", request.invite_id);
    const { data: gone } = await supabase
      .from("invites")
      .delete()
      .eq("id", request.invite_id)
      .select("id");
    if (!gone || gone.length === 0) {
      revalidateTreePages();
      return {
        error: "Request deleted, but its founder invite is still live. Delete it from Sent invites on the tree it came from.",
      };
    }
  }

  revalidateTreePages();
  return {};
}
