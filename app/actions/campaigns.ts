"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { campaignHref, readCampaignFields } from "@/lib/campaigns";
import { revalidateTreePages } from "@/lib/revalidate";
import { redeemCampaign } from "@/lib/sign-in.server";
import { createClient } from "@/lib/supabase/server";
import { joinedTreeHref } from "@/lib/tree-links";
import { isBetaReviewer } from "@/lib/tree-requests.server";

export type CampaignActionResult = { error?: string };

const NOT_REVIEWER = "Only a beta reviewer can manage campaign links.";

/**
 * Reviewer: a new campaign link (Step 103.3), named, with where it's
 * posted. Its code is made by the database. Each function checks the
 * reviewer again.
 */
export async function createCampaign(
  name: string,
  placement: string,
): Promise<CampaignActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const fields = readCampaignFields(name, placement);
  if (!fields.ok) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_campaign", {
    p_name: fields.name,
    p_placement: fields.placement ?? undefined,
  });
  if (error) return { error: "Could not make the link. Try again." };
  revalidatePath("/admin");
  return {};
}

/** Reviewer: rename a campaign link, or change where it's posted. */
export async function updateCampaign(
  id: string,
  name: string,
  placement: string,
): Promise<CampaignActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const fields = readCampaignFields(name, placement);
  if (!fields.ok) return { error: fields.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_campaign", {
    p_id: id,
    p_name: fields.name,
    p_placement: fields.placement ?? "",
  });
  if (error) return { error: "Could not save the link. Try again." };
  revalidatePath("/admin");
  return {};
}

/** Reviewer: pause a campaign link, so nobody signs up through it, or resume it. */
export async function setCampaignPaused(
  id: string,
  paused: boolean,
): Promise<CampaignActionResult> {
  if (!(await isBetaReviewer())) return { error: NOT_REVIEWER };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_campaign_paused", {
    p_id: id,
    p_paused: paused,
  });
  if (error) {
    return { error: paused ? "Could not pause the link. Try again." : "Could not resume the link. Try again." };
  }
  revalidatePath("/admin");
  return {};
}

/**
 * A member opening a campaign link (Step 103.3): one button starts their
 * own tree, as a founder invite's does, and opens it.
 */
export async function startTreeFromCampaign(code: string): Promise<CampaignActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const started = await redeemCampaign(supabase, code);
  if (!started.ok) {
    // Its page says why: paused, or a tree of theirs already.
    revalidatePath(campaignHref(code));
    return {
      error:
        started.reason === "has_tree"
          ? "You've started a tree already."
          : started.reason === "closed"
            ? "This link is paused."
            : "Could not start your tree. Try again.",
    };
  }
  revalidateTreePages();
  redirect(joinedTreeHref(started.joined));
}
