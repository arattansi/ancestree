"use client";

import * as React from "react";

import { deleteTree } from "@/app/actions/trees";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";

/**
 * Delete a tree (Step 25). Entries whose home it was move to another tree
 * that shows them; the rest go with it. Typing the name confirms.
 */
export function AdminDeleteTree({ treeId, name }: { treeId: string; name: string }) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const action = useAction({ inline: true });

  function onOpenChange(next: boolean) {
    // Nothing backs out of a deletion already on its way: "Keep the tree"
    // would only look as if it had.
    if (!next && action.pending) return;
    if (next) action.setError(null);
    setOpen(next);
  }

  function onConfirm() {
    // Success redirects away, and the button stays busy until it has; only
    // a refusal comes back.
    action.run("delete", () => deleteTree(treeId));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" className="text-destructive">
            Delete this tree
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>
            Everything is deleted, except people who are also on another tree.
            Members keep their accounts.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-tree-name">Type the tree&rsquo;s name to confirm</Label>
          <Input
            id="confirm-tree-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>
        <FormError>{action.error}</FormError>
        <DialogFooter>
          <DialogClose
            disabled={action.pending}
            render={<Button variant="outline">Keep the tree</Button>}
          />
          <PendingButton
            variant="destructive-solid"
            onClick={onConfirm}
            pending={action.pending}
            pendingLabel="Deleting…"
            disabled={typed.trim() !== name}
          >
            Delete permanently
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
