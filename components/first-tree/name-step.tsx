"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { renameTree } from "@/app/actions/trees";
import { FormError } from "@/components/form-error";
import { LinkPendingLabel } from "@/components/link-pending";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";

const MAX_TREE_NAME = 80;

/**
 * Naming the tree, in the founder's first run (Step 29). It opens on their
 * family's name when the tree still has the one it was planted with, and
 * saves only a change.
 */
export function NameStep({
  treeId,
  initialName,
  currentName,
  nextHref,
}: {
  treeId: string;
  /** What the box starts with: a suggestion, or the name it already has. */
  initialName: string;
  currentName: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const action = useAction({ inline: true });
  const error = action.error;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      action.setError("Give your tree a name.");
      return;
    }
    const unchanged = trimmed === currentName.trim();
    action.run(
      "save",
      async () => (unchanged ? {} : renameTree(treeId, trimmed)),
      {
        success: unchanged ? undefined : `Your tree is called ${trimmed}.`,
        // Busy until the next step is on screen, saved or not.
        onSuccess: () => router.push(nextHref),
      },
    );
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="first-tree-name">Your tree&rsquo;s name</Label>
            <Input
              id="first-tree-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_TREE_NAME}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "first-tree-name-error" : undefined}
            />
            <FormError id="first-tree-name-error">{error}</FormError>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PendingButton
              type="submit"
              pending={action.pending}
              pendingLabel="Saving…"
            >
              Save and continue
            </PendingButton>
            <Button
              nativeButton={false}
              render={<Link href={nextHref} />}
              variant="ghost"
            >
              <LinkPendingLabel>Skip for now</LinkPendingLabel>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
