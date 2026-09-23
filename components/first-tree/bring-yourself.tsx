"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { bringOwnEntry } from "@/app/actions/trees";
import { FamilyPersonChip } from "@/components/first-tree/family-person-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { FamilyCard } from "@/lib/first-tree";

/**
 * A founder who's already on another tree brings their own entry onto the
 * one they've just founded (Step 29): one button, the same entry — never a
 * second copy of them. It also becomes the tree's anchor (`place_people`).
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
  const [pending, setPending] = React.useState(false);

  async function onBring() {
    setPending(true);
    const res = await bringOwnEntry(treeId);
    if (res.error) {
      setPending(false);
      toast.error(res.error);
      return;
    }
    toast.success(`You're on ${treeName}.`);
    router.push(nextHref);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <FamilyPersonChip person={entry} highlight />
        <Button onClick={onBring} disabled={pending}>
          {pending ? "Bringing you across…" : `Put me on ${treeName}`}
        </Button>
      </CardContent>
    </Card>
  );
}
