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

/**
 * Deletes the signed-in member's account. The tree's only Root must first
 * choose who takes over as Root (`successors` is non-null only for them): that
 * member is made a Root, for good, and inherits what the Root added.
 */
export function DeleteAccount({
  successors = null,
}: {
  successors?: readonly SuccessorOption[] | null;
}) {
  const [busy, setBusy] = React.useState(false);
  const [successor, setSuccessor] = React.useState<string | null>(null);
  const soleRoot = successors !== null;

  async function onConfirm() {
    setBusy(true);
    const res = await deleteAccount(successor ?? undefined);
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
            {soleRoot
              ? "You're the tree's only Root, so someone has to take over before you go. They become a Root — for good — and the entries and relationships you added pass to them. This permanently removes your sign-in and profile, and cannot be undone."
              : "This permanently removes your sign-in and profile. Entries and relationships you added stay on the shared family tree under a Root’s stewardship. To have those removed too, ask a Root before deleting. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        {soleRoot ? (
          successors.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="successor">Who takes over as Root?</Label>
              <Select
                items={successors.map((s) => ({
                  value: s.userId,
                  label: s.name,
                }))}
                value={successor}
                onValueChange={(v) => setSuccessor(v as string | null)}
                disabled={busy}
              >
                <SelectTrigger id="successor" className="w-full">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {successors.map((s) => (
                    <SelectItem key={s.userId} value={s.userId}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              There&rsquo;s nobody else on the tree to hand it to yet. Invite
              someone first, then come back.
            </p>
          )
        ) : null}

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">Keep my account</Button>}
          />
          <Button
            onClick={onConfirm}
            disabled={busy || (soleRoot && !successor)}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {busy
              ? "Deleting…"
              : soleRoot
                ? "Hand over and delete"
                : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
