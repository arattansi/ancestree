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

export function DeleteAccount() {
  const [busy, setBusy] = React.useState(false);

  async function onConfirm() {
    setBusy(true);
    const res = await deleteAccount();
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
            This permanently removes your sign-in and profile. Entries and
            relationships you added stay on the shared family tree under an
            admin&rsquo;s stewardship. To have those removed too, ask an admin
            before deleting. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Keep my account</Button>} />
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
