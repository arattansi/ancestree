"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";

import { requireProfile } from "@/lib/auth";
import { bloodTiePlacementRefusal, readBloodTieRefusal } from "@/lib/bloodline";
import { friendlyDbError, ownedWrite, type ErrorRule } from "@/lib/db-errors";
import { removeTreeFilesLater, treeFiles } from "@/lib/file-cleanup.server";
import { TREE_NAME_MAX } from "@/lib/limits";
import {
  clearCurrentTreeCookie,
  setCurrentTreeCookie,
} from "@/lib/current-tree.server";
import { personDisplayName } from "@/lib/person-name";
import { alertPlacementAsks } from "@/lib/placement-alerts.server";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreePages } from "@/lib/revalidate";
import { redeemInvite } from "@/lib/sign-in.server";
import { membershipOf, rootOf, type TreeMembership } from "@/lib/tree-context";
import { joinedTreeHref, treesHref } from "@/lib/tree-links";

/** What a refused tree write says, by the database's reason. */
const TREE_RULES: readonly ErrorRule[] = [
  [
    "one_tree_each",
    "You've already started a tree of your own. You can be a Root of several trees, but found only one.",
  ],
  [
    "tree_request_needed",
    "New trees are by request during the beta. Ask from your trees page, and we'll let you know when you can start one.",
  ],
  ["name your tree", "Give your tree a name."],
  ["only a root", "Only a Root of this tree can do that."],
];
const TREE_FALLBACK = "Couldn't do that. Try again.";

function friendlyTreeError(message: string | undefined): string {
  return friendlyDbError(message, TREE_RULES, TREE_FALLBACK);
}

export type FoundTreeResult = { slug?: string; error?: string };

/**
 * A member starts a tree of their own (Step 25, the married-in path): a
 * fresh tree with them as its Root. Nothing is copied; their first run on it
 * (Step 29) brings their own entry and close family over from the trees they
 * belong to (`bringOwnEntry`, `placePeople`). During the beta only once a
 * reviewer has approved their request (Step 28, `requestNewTree`); the
 * database refuses anyone else.
 */
export async function foundTree(name: string): Promise<FoundTreeResult> {
  await requireProfile();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your tree a name." };
  if (trimmed.length > TREE_NAME_MAX) return { error: "That name is too long." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("found_tree", { p_name: trimmed });
  if (error || !data) return { error: friendlyTreeError(error?.message) };

  // Their new tree is the one they're looking at from here on.
  await setCurrentTreeCookie(data.id);
  revalidateTreePages();
  return { slug: data.slug };
}

/** Root: rename a tree. Its URL slug follows the name. */
export async function renameTree(
  treeId: string,
  name: string,
): Promise<{ slug?: string; error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: notRoot };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your tree a name." };
  if (trimmed.length > TREE_NAME_MAX) return { error: "That name is too long." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rename_tree", {
    p_tree: treeId,
    p_name: trimmed,
  });
  if (error || !data) return { error: friendlyTreeError(error?.message) };
  revalidateTreePages();
  return { slug: data.slug };
}

export type PlacementOutcome = {
  personId: string;
  /** How much of them the tree shows: `asked` and `declined` are basic cards. */
  approval: string;
};

/**
 * Emails whoever was just asked about `asked`, once this has answered. The
 * Root is named as the notice names them: by their own entry, else the name
 * they go by.
 */
async function emailAsked(
  membership: TreeMembership,
  asked: string[],
): Promise<void> {
  if (asked.length === 0) return;
  const selfId = membership.profile.self_person_id;
  const supabase = await createClient();
  const { data: entry } = selfId
    ? await supabase
        .from("people")
        .select("first_name, preferred_name, last_name")
        .eq("id", selfId)
        .maybeSingle()
    : { data: null };
  const placerName = entry
    ? personDisplayName(entry)
    : membership.profile.display_name?.trim() || "A relative";
  after(() =>
    alertPlacementAsks({
      treeId: membership.tree.id,
      treeName: membership.tree.name,
      placerName,
      personIds: asked,
    }),
  );
}

/**
 * Root: bring people onto a tree (Steps 25 and 80). Anyone the Root can see
 * on a tree they belong to, with a blood tie here once the whole batch is
 * placed (Step 55). Everyone is on the tree at once: whole when the entry is
 * the Root's own or theirs to edit, otherwise as a basic card while the
 * member whose entry it is, or whoever may edit it on its home tree, is
 * asked — by notice, and by an email sent once this has answered.
 */
export async function placePeople(
  treeId: string,
  personIds: string[],
): Promise<{ placed?: PlacementOutcome[]; error?: string }> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (notRoot || !membership) return { error: notRoot };
  const ids = [...new Set(personIds)].filter(Boolean);
  if (ids.length === 0) return { error: "Pick at least one person." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_people", {
    p_tree: treeId,
    p_person_ids: ids,
  });
  if (error) {
    // Someone in the batch has no blood tie here (Step 55): nothing was placed.
    const refusal = readBloodTieRefusal(error);
    if (refusal) return { error: bloodTiePlacementRefusal(refusal) };
    return {
      error: friendlyDbError(
        error.message,
        [
          [
            "only bring people you can see",
            "You can only bring people you can see on a tree you belong to.",
          ],
          ...TREE_RULES,
        ],
        TREE_FALLBACK,
      ),
    };
  }

  await emailAsked(
    membership,
    (data ?? []).flatMap((r) =>
      r.newly_asked && r.placed_person_id ? [r.placed_person_id] : [],
    ),
  );

  revalidateTreePages();
  return {
    placed: (data ?? []).map((r) => ({
      personId: r.placed_person_id ?? "",
      approval: r.placement_approval ?? "none",
    })),
  };
}

/**
 * Root: ask again about cards whose ask lapsed (Step 83): another 30 days,
 * with the notice and the email of a first ask. An ask answered since, or
 * still waiting, is left as it is.
 */
export async function askPlacementsAgain(
  treeId: string,
  personIds: string[],
): Promise<{ asked?: number; error?: string }> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (notRoot || !membership) return { error: notRoot };
  const ids = [...new Set(personIds)].filter(Boolean);
  if (ids.length === 0) return { error: "Nothing to ask again." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ask_placements_again", {
    p_tree: treeId,
    p_person_ids: ids,
  });
  if (error) return { error: friendlyTreeError(error.message) };
  const asked = (data ?? []).flatMap((r) =>
    r.asked_person_id ? [r.asked_person_id] : [],
  );
  if (asked.length === 0) {
    // Answered, or asked again, since the page was drawn.
    revalidateTreePages();
    return { error: "Nothing left to ask again." };
  }

  await emailAsked(membership, asked);
  revalidateTreePages();
  return { asked: asked.length };
}

/**
 * A founder who already has an entry on another tree brings it onto the one
 * they've just founded (Step 29): still one entry, now shown here too.
 * `place_people` makes it this tree's anchor, as adding themselves would.
 */
export async function bringOwnEntry(treeId: string): Promise<{ error?: string }> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (!membership) return { error: notRoot };
  const selfId = membership.profile.self_person_id;
  if (!selfId) return { error: "You don't have an entry to bring yet." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("place_people", {
    p_tree: treeId,
    p_person_ids: [selfId],
  });
  if (error) {
    return {
      error: readBloodTieRefusal(error)
        ? "Your entry isn't connected to anyone born into this family, so it can't be shown here."
        : friendlyTreeError(error.message),
    };
  }
  revalidateTreePages();
  return {};
}

/** What a refused answer says (Step 80). */
const ANSWER_RULES: readonly ErrorRule[] = [
  ["no longer exists", "That request no longer exists."],
  ["only the person", "Only the person this entry belongs to can answer."],
  [
    "only someone who can edit",
    "Only someone who can edit this entry can answer.",
  ],
  ["home tree shows", "An entry’s home tree always shows all of it."],
  ...TREE_RULES,
];

/**
 * Yes or no to showing whole entries on a tree that isn't their home (Step
 * 80): the member whose entry it is, or for nobody's own entry whoever may
 * edit it. A no leaves the basic card; either answer can be changed later.
 */
export async function answerPlacements(
  placementIds: string[],
  accept: boolean,
): Promise<{ answered?: number; error?: string }> {
  await requireProfile();
  const ids = [...new Set(placementIds)].filter(Boolean);
  if (ids.length === 0) return { error: "Nothing to answer." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("answer_placements", {
    p_placement_ids: ids,
    p_accept: accept,
  });
  if (error) {
    return { error: friendlyDbError(error.message, ANSWER_RULES, TREE_FALLBACK) };
  }
  revalidateTreePages();
  return { answered: (data ?? []).length };
}

/** One answer, from a notice's buttons. */
export async function respondToPlacement(
  placementId: string,
  accept: boolean,
): Promise<{ error?: string }> {
  const { error } = await answerPlacements([placementId], accept);
  return error ? { error } : {};
}

/**
 * Root: take a person off a tree that isn't their home. Their entry and its
 * connections are untouched. The person themselves no longer can (Step 80):
 * a basic card needs nobody's yes, and what they take back is the rest of
 * their entry (`answerPlacements`).
 */
export async function removePlacement(
  treeId: string,
  personId: string,
): Promise<{ error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: notRoot };
  const supabase = await createClient();
  const removed = await ownedWrite(
    supabase
      .from("tree_placements")
      .delete()
      .eq("tree_id", treeId)
      .eq("person_id", personId)
      .select("id"),
    {
      refused: "They aren’t on this tree any more.",
      failed: (m) =>
        friendlyDbError(
          m,
          [
            [
              "HOME_PLACEMENT",
              "This is the entry's home tree. Move its home first, or delete the entry.",
            ],
            ...TREE_RULES,
          ],
          TREE_FALLBACK,
        ),
    },
  );
  if (removed.error) return { error: removed.error };
  revalidateTreePages();
  return {};
}

/**
 * Move a person's home to another tree that already shows them: the person
 * themselves, or a Root of the current home for an unclaimed entry.
 */
export async function setHomeTree(
  personId: string,
  treeId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_home_tree", {
    p_person: personId,
    p_tree: treeId,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          [
            "must already show",
            "That tree doesn't show this entry yet. A Root there has to bring it over first.",
          ],
          [
            "only this person",
            "Only this person, or a Root of their home tree for an unclaimed entry, can move their home.",
          ],
          ...TREE_RULES,
        ],
        TREE_FALLBACK,
      ),
    };
  }
  revalidateTreePages();
  return {};
}

/** Hide (or show) an entry to visitors from other trees (Step 25.4). */
export async function setHiddenFromVisitors(
  personId: string,
  hidden: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const saved = await ownedWrite(
    supabase
      .from("people")
      .update({ hidden_from_visitors: hidden })
      .eq("id", personId)
      .select("id"),
    {
      refused:
        "Only this person, or whoever can edit their entry, can change that.",
      failed: friendlyTreeError,
    },
  );
  if (saved.error) return { error: saved.error };
  revalidateTreePages();
  return {};
}

/**
 * Root: open this tree to the members of another tree they belong to, or
 * close it again (Step 25.4). Only a Root may; only for trees they are on.
 */
export async function setTreeVisibility(
  treeId: string,
  viewerTreeId: string,
  visible: boolean,
): Promise<{ error?: string }> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (!membership) return { error: notRoot };
  const { error: notThere } = await membershipOf(viewerTreeId);
  if (notThere) return { error: "You can only open your tree to a tree you belong to." };

  const supabase = await createClient();
  if (visible) {
    const { error } = await supabase.from("tree_visibility").upsert(
      {
        tree_id: treeId,
        viewer_tree_id: viewerTreeId,
        granted_by: membership.profile.auth_user_id,
      },
      { onConflict: "tree_id,viewer_tree_id" },
    );
    if (error) return { error: friendlyTreeError(error.message) };
  } else {
    const { error } = await supabase
      .from("tree_visibility")
      .delete()
      .eq("tree_id", treeId)
      .eq("viewer_tree_id", viewerTreeId);
    if (error) return { error: friendlyTreeError(error.message) };
  }
  revalidateTreePages();
  return {};
}

/**
 * A signed-in member accepts an invite to another tree (Step 25). Lands on
 * their own entry on that tree's canvas when the tree shows it — accepting
 * brings it there, a claim invite's entry folded into it where it can be
 * (Steps 30.9 and 41.3), and a claim invite greets them there first (Step
 * 50) — else on its onboarding, which walks a founder invite's new Root
 * through their first run (Step 29). An invite emailed to another address
 * is refused (Step 51); the page only offers the button to its address, so
 * that means they've signed in as someone else since it loaded.
 */
export async function joinTreeWithInvite(token: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const redeemed = await redeemInvite(supabase, token);
  if (!redeemed.ok) {
    if (redeemed.reason === "another_address") {
      // Drawn again for whoever is signed in now, it says whose invite it
      // is; pages kept from before they switched accounts go too.
      revalidateTreePages();
      return { error: "This invite was sent to another email address." };
    }
    return { error: "That invite is invalid, used up, or expired." };
  }
  revalidateTreePages();
  redirect(joinedTreeHref(redeemed.joined));
}

/**
 * Root: delete a tree they run. Entries whose home it was move to another
 * tree that shows them; the rest go with it (`delete_tree`), and so do
 * their files (Step 90) and the album photos nobody else is in (Step
 * 88.5): read before, removed after the response wherever nothing points
 * at them any more.
 */
export async function deleteTree(treeId: string): Promise<{ error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: notRoot };
  const supabase = await createClient();
  const files = await treeFiles(treeId);
  const { error } = await supabase.rpc("delete_tree", { p_tree: treeId });
  if (error) return { error: friendlyTreeError(error.message) };
  removeTreeFilesLater(files);
  await clearCurrentTreeCookie();
  revalidateTreePages();
  redirect(treesHref());
}
