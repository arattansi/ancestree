"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { foundTree } from "@/app/actions/trees";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { TREE_NAME_MAX } from "@/lib/limits";
import { onboardingHref } from "@/lib/tree-links";

/**
 * "Start a tree of your own" (Step 25): a name, and the member becomes the
 * first Root of a fresh tree. It lands on the founder's first run there
 * (Step 29) — invite, bring themselves and their close family over — as the
 * new tree is the current one from here on.
 */
export function FoundTreeForm({ suggestedName }: { suggestedName: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(suggestedName);
  const action = useAction({ inline: true });

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    action.run(
      "plant",
      async () => {
        const res = await foundTree(name);
        return res.error || !res.slug
          ? { error: res.error ?? "Couldn't start your tree." }
          : res;
      },
      {
        success: "Your tree is planted.",
        // Busy until the first run has opened, so a second press can't
        // plant a second tree.
        onSuccess: () => router.push(onboardingHref()),
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tree-name">Name your tree</Label>
        <Input
          id="tree-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={TREE_NAME_MAX}
          autoComplete="off"
          required
        />
        <p className="text-xs text-muted-foreground">
          Call it whatever you like — the family name, say. You can rename it
          any time from its Root console; the web address follows the name.
        </p>
      </div>
      <FormError>{action.error}</FormError>
      <PendingButton
        type="submit"
        pending={action.pending}
        disabled={!name.trim()}
        pendingLabel="Planting…"
      >
        Start my tree
      </PendingButton>
    </form>
  );
}
