"use server";

import { after } from "next/server";

import {
  sendDirectInvites,
  type DirectInviteRow,
  type SendDirectInvitesState,
} from "@/app/actions/invites";
import { requireProfile } from "@/lib/auth";
import {
  RELAY_ANSWERED,
  readRelativeEmail,
  relativeEmailProblem,
} from "@/lib/invite-relays";
import { passOnRelay } from "@/lib/invite-relays.server";
import { readNameAndEmail } from "@/lib/request-forms";
import { revalidateTreeAndAccount } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

export type AskRelativeState = {
  ok?: boolean;
  /** The relative's address as typed, to show again beside a problem. */
  relativeEmail?: string;
  error?: string;
};

/**
 * Public: ask a relative who's on ancestree to invite you (Step 30.5) —
 * request access's answer when it couldn't find you on a tree. Only the
 * typing is checked here. Whether the address is a member's, the caps and
 * the email all come after the answer (`passOnRelay`), so the answer, and
 * how long it takes, are the same whoever the address belongs to.
 */
export async function askRelative(
  _prev: AskRelativeState,
  formData: FormData,
): Promise<AskRelativeState> {
  const { entered, problem } = readNameAndEmail(formData);
  const relativeEmail = readRelativeEmail(formData);
  // Their own details came from the search they've just run.
  if (problem) return { error: problem.message, relativeEmail };
  const relativeProblem = relativeEmailProblem(relativeEmail, entered.email);
  if (relativeProblem) return { error: relativeProblem, relativeEmail };

  after(() => passOnRelay({ ...entered, relativeEmail }));
  return { ok: true, relativeEmail };
}

/**
 * Member: send the invite an ask filled in (Step 30.5). It goes as any
 * invite they send (`sendDirectInvites`, which checks they're on `treeId`
 * and joins them as a Leaf), with the name and address from the form, so a
 * spelling can be put right first. Then the ask is answered, so it leaves
 * their list.
 */
export async function sendRelayedInvite(
  relayId: string,
  treeId: string,
  row: DirectInviteRow,
): Promise<SendDirectInvitesState> {
  await requireProfile();
  const supabase = await createClient();

  // Only the member it was passed to can see it (RLS).
  const { data: relay } = await supabase
    .from("invite_relays")
    .select("id, status")
    .eq("id", relayId)
    .maybeSingle();
  if (!relay || relay.status !== "pending") return { error: RELAY_ANSWERED };

  const res = await sendDirectInvites(treeId, [row]);
  if (res.error || !res.results?.some((r) => r.minted)) return res;

  await supabase
    .from("invite_relays")
    .update({
      status: "invited",
      tree_id: treeId,
      answered_at: new Date().toISOString(),
    })
    .eq("id", relayId)
    .eq("status", "pending");
  revalidateTreeAndAccount();
  return res;
}

/**
 * Member: dismiss an ask from someone they don't know (Step 30.5). The
 * newcomer isn't told, and the same address can't ask them again; the
 * record stays, as a declined request's does.
 */
export async function dismissRelay(relayId: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invite_relays")
    .update({ status: "dismissed", answered_at: new Date().toISOString() })
    .eq("id", relayId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: "Couldn't dismiss that request. Try again." };
  if (!data || data.length === 0) return { error: RELAY_ANSWERED };

  revalidateTreeAndAccount();
  return {};
}
