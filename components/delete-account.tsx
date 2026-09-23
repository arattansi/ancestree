"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteAccount } from "@/app/actions/privacy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SuccessorOption = { userId: string; name: string };

/** A tree the member is the only Root of, and who could take it over. */
export type SoleRootTree = {
  treeId: string;
  treeName: string;
  successors: SuccessorOption[];
};

/**
 * Deletes the signed-in member's account. For every tree they are the only
 * Root of (Step 25), they must first choose who takes over there: that
 * member is made a Root, for good, and inherits what the Root added — the
 * Branches they made too, which count toward the new Root's four (Step 39).
 */
export function DeleteAccount({
  soleRootTrees = [],
  madeBranches = false,
}: {
  soleRootTrees?: readonly SoleRootTree[];
  /** They've made someone a Branch on a tree, who passes to a Root there. */
  madeBranches?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [successors, setSuccessors] = React.useState<Record<string, string>>({});
  const handingOver = soleRootTrees.length > 0;
  const everyTreeCovered = soleRootTrees.every((t) => !!successors[t.treeId]);
  const stuck = soleRootTrees.some((t) => t.successors.length === 0);

  async function onConfirm() {
    setBusy(true);
    const res = await deleteAccount({ successors });
    // On success the action redirects and this never runs.
    setBusy(false);
    if (res?.error) toast.error(res.error);
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" className="text-destructive">
            Delete my account
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            {handingOver
              ? `You're the only Root of a tree, so someone has to take over before you go. They become a Root — for good — and the entries and relationships you added there pass to them${madeBranches ? ", along with the Branches you made" : ""}. This permanently removes your sign-in and profile from every tree, and cannot be undone.`
              : `This permanently removes your sign-in and profile from every tree you belong to. Entries and relationships you added stay on each tree under a Root’s stewardship${madeBranches ? ", and the Branches you made pass to that Root" : ""}. To have those removed too, ask a Root before deleting. This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {soleRootTrees.map((t) => {
          const id = `successor-${t.treeId}`;
          return t.successors.length > 0 ? (
            <div key={t.treeId} className="flex flex-col gap-2">
              <Label htmlFor={id}>Who takes over {t.treeName}?</Label>
              <Select
                items={t.successors.map((s) => ({ value: s.userId, label: s.name }))}
                value={successors[t.treeId] ?? null}
                onValueChange={(v) =>
                  setSuccessors((prev) => {
                    const next = { ...prev };
                    if (typeof v === "string") next[t.treeId] = v;
                    else delete next[t.treeId];
                    return next;
                  })
                }
                disabled={busy}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {t.successors.map((s) => (
                    <SelectItem key={s.userId} value={s.userId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p key={t.treeId} className="text-sm text-muted-foreground">
              There&rsquo;s nobody else on {t.treeName} to hand it to yet.
              Invite someone first, then come back.
            </p>
          );
        })}

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">Keep my account</Button>}
          />
          <Button
            onClick={onConfirm}
            disabled={busy || stuck || (handingOver && !everyTreeCovered)}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {busy
              ? "Deleting…"
              : handingOver
                ? "Hand over and delete"
                : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
