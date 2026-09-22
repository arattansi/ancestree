"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteTree } from "@/app/actions/trees";
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

/**
 * Delete a tree (Step 25). Entries whose home it was move to another tree
 * that shows them; the rest go with it. Typing the name confirms.
 */
export function AdminDeleteTree({ treeId, name }: { treeId: string; name: string }) {
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function onConfirm() {
    setBusy(true);
    const res = await deleteTree(treeId);
    // Success redirects away; only a refusal comes back.
    setBusy(false);
    if (res?.error) toast.error(res.error);
  }

  return (
    <Dialog>
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
            Everyone whose home this tree is moves to another tree that shows
            them. Anyone shown nowhere else is deleted with it, along with
            this tree&rsquo;s comments, documents, companions, invites and
            share links. Members keep their accounts. This cannot be undone.
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
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Keep the tree</Button>} />
          <Button
            onClick={onConfirm}
            disabled={busy || typed.trim() !== name}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
