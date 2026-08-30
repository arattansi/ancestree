"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { multiTreeEnabled } from "@/lib/flags";
import { personSchema, toPersonPayload } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/server";
import type { PersonFormValues } from "@/lib/person-schema";

export type StartTreeResult = {
  treeId?: string;
  personId?: string;
  error?: string;
};

function friendlyStartTreeError(message: string | undefined): string {
  if (!message) return "Something went wrong. Try again.";
  const m = message.toLowerCase();
  if (m.includes("already started your own tree")) {
    return "You've already started your own tree.";
  }
  if (m.includes("not a member of that tree")) {
    return "You can only bridge to a tree you already belong to.";
  }
  if (m.includes("no longer on the tree")) {
    return "That person is no longer on the tree. Refresh and try again.";
  }
  if (m.includes("name your new tree")) {
    return "Give your new tree a name.";
  }
  if (m.includes("row-level security")) {
    return "You don't have permission to do that.";
  }
  return "Couldn't start your tree. Check the fields and try again.";
}

/**
 * Multi-tree seam (Step 9). Creates a member's own `trees` row, their root
 * person in it, and a spouse bridge (`tree_bridges`) back to a person on a tree
 * they already belong to. Feature-flagged; the new tree isn't rendered in v1.
 */
export async function startOwnTree(input: {
  treeName: string;
  bridgePersonId: string;
  person: PersonFormValues;
}): Promise<StartTreeResult> {
  if (!multiTreeEnabled) {
    return { error: "Starting your own tree isn't available yet." };
  }

  await requireProfile();

  const treeName = input.treeName.trim();
  if (!treeName) return { error: "Give your new tree a name." };
  if (!input.bridgePersonId) {
    return { error: "Pick the relative your new tree connects through." };
  }

  const parsed = personSchema.safeParse(input.person);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  const p = toPersonPayload(parsed.data);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_own_tree", {
    p_tree_name: treeName,
    p_bridge_person_id: input.bridgePersonId,
    p_person: {
      given_name: p.given_name ?? "",
      preferred_name: p.preferred_name ?? "",
      family_name: p.family_name,
      country_of_birth: p.country_of_birth,
      city_of_birth: p.city_of_birth ?? "",
      date_of_birth: p.date_of_birth ?? "",
      is_deceased: p.is_deceased,
      date_of_death: p.date_of_death ?? "",
      place_of_death: p.place_of_death ?? "",
    },
  });

  if (error || !data) {
    return { error: friendlyStartTreeError(error?.message) };
  }

  const result = data as { tree_id: string; person_id: string };
  revalidatePath("/tree");
  revalidatePath("/account");
  return { treeId: result.tree_id, personId: result.person_id };
}
