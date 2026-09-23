"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  sendClaimInvite,
  sendDirectInvites,
  type ClaimInviteState,
  type DirectInviteRow,
  type SendDirectInvitesState,
} from "@/app/actions/invites";
import { requireProfile } from "@/lib/auth";
import {
  RELAY_ANSWERED,
  readRelativeEmail,
  relativeEmailProblem,
  relayLapseCutoff,
  relayLapsed,
} from "@/lib/invite-relays";
import { passOnRelay } from "@/lib/invite-relays.server";
import { getRelayCandidates } from "@/lib/relay-candidates.server";
import { chosenCandidate } from "@/lib/request-candidates";
import { readNameAndEmail } from "@/lib/request-forms";
import { revalidateTreeAndAccount } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

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
 * Whether the ask is still waiting: not answered, and not lapsed (Step
 * 41.5). Only the member it went to sees it (RLS).
 */
async function relayIsPending(
  supabase: ServerClient,
  relayId: string,
): Promise<boolean> {
  const { data: relay } = await supabase
    .from("invite_relays")
    .select("id, status, created_at")
    .eq("id", relayId)
    .maybeSingle();
  return relay?.status === "pending" && !relayLapsed(relay.created_at, new Date());
}

/**
 * Answer the ask once an invite has been made for it, whether or not its
 * email went, so it leaves their list. It names the tree the invite is to.
 */
async function markRelayInvited(
  supabase: ServerClient,
  relayId: string,
  treeId: string,
): Promise<void> {
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

  if (!(await relayIsPending(supabase, relayId))) return { error: RELAY_ANSWERED };

  const res = await sendDirectInvites(treeId, [row]);
  if (res.error || !res.results?.some((r) => r.minted)) return res;

  await markRelayInvited(supabase, relayId, treeId);
  return res;
}

/**
 * Member: send the ask as an invite to claim one of the entries its name
 * matches on `treeId` (Step 41.1): the newcomer, on the tree under another
 * spelling. Accepting it claims the entry and opens the tree on it (Step
 * 30.2), so onboarding's search, which could miss them again, never comes
 * into it. The entry is asked about again here (`invite_relay_candidates`)
 * rather than taken on the browser's word: still living, nobody's, placed
 * on that tree, matched by the ask's name and theirs to hand over. It goes
 * as any claim invite they send (`sendClaimInvite`), into that tree and to
 * the address in the form, and the ask is answered once the invite is made.
 */
export async function sendRelayedClaimInvite(
  relayId: string,
  treeId: string,
  personId: string,
  email: string,
): Promise<ClaimInviteState> {
  await requireProfile();
  const supabase = await createClient();

  if (!(await relayIsPending(supabase, relayId))) return { error: RELAY_ANSWERED };

  const candidates = await getRelayCandidates(relayId, treeId);
  if (!candidates) return { error: "Couldn't check that entry. Try again." };
  if (!chosenCandidate(candidates, personId)) {
    return {
      error:
        "Their name no longer matches that entry, or someone has claimed it. Reload to see who’s left.",
    };
  }

  const res = await sendClaimInvite(personId, email, treeId);
  if (res.minted) await markRelayInvited(supabase, relayId, treeId);
  return res;
}

/**
 * Member: dismiss an ask from someone they don't know (Step 30.5). The
 * newcomer isn't told, and the same address can't ask them again; the
 * record stays, as a declined request's does. One that has lapsed is gone
 * already (Step 41.5).
 */
export async function dismissRelay(relayId: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const now = new Date();
  const { data, error } = await supabase
    .from("invite_relays")
    .update({ status: "dismissed", answered_at: now.toISOString() })
    .eq("id", relayId)
    .eq("status", "pending")
    .gt("created_at", relayLapseCutoff(now))
    .select("id");
  if (error) return { error: "Couldn't dismiss that request. Try again." };
  if (!data || data.length === 0) return { error: RELAY_ANSWERED };

  revalidateTreeAndAccount();
  return {};
}

/**
 * Member: whether relatives may ask them for an invite (Step 41.5), the
 * "Relatives can ask me to invite them" box on settings. Off,
 * `invite_relay_recipient` finds nobody at their address, so a newcomer's
 * ask goes no further and they're told what everyone is told. Asks already
 * waiting stay until they're answered or lapse.
 */
export async function setRelativesCanAsk(on: boolean): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (typeof on !== "boolean") return { error: "Couldn't save that. Try again." };
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ relatives_can_ask: on })
    .eq("auth_user_id", profile.auth_user_id);
  if (error) return { error: "Couldn't save that. Try again." };

  revalidatePath("/account");
  return {};
}
