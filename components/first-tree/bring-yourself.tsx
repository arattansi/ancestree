"use client";

import { useRouter } from "next/navigation";

import { bringOwnEntry } from "@/app/actions/trees";
import { FamilyPersonChip } from "@/components/first-tree/family-person-chip";
import { PendingButton } from "@/components/pending-button";
import { useAction } from "@/components/use-action";
import type { FamilyCard } from "@/lib/first-tree";

/**
 * A founder who's already on another tree brings their own entry onto the
 * one they've just founded (Step 29): one button, the same entry — never a
 * second copy of them. It also becomes the tree's anchor (`place_people`).
 * It fills the middle of the family step, where the founder goes first
 * (Step 161).
 */
export function BringYourself({
  treeId,
  treeName,
  entry,
  nextHref,
}: {
  treeId: string;
  treeName: string;
  entry: FamilyCard & { homeTreeName: string | null };
  nextHref: string;
}) {
  const router = useRouter();
  const action = useAction();

  function onBring() {
    action.run("bring", () => bringOwnEntry(treeId), {
      success: `You're on ${treeName}.`,
      // Busy until the next step is on screen.
      onSuccess: () => router.push(nextHref),
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <FamilyPersonChip person={entry} />
      <PendingButton
        onClick={onBring}
        pending={action.pending}
        pendingLabel="bringing you across…"
      >
        put me on {treeName}
      </PendingButton>
    </div>
  );
}
