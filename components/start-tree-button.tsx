"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { requestNewTree } from "@/app/actions/tree-requests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { newTreeHref } from "@/lib/tree-links";
import { TREE_REQUEST_RECEIVED, type TreeRequestStatus } from "@/lib/tree-requests";

type ButtonLook = Pick<
  React.ComponentProps<typeof Button>,
  "size" | "variant" | "className"
>;

/**
 * Starting a tree, for a signed-in member (Step 28). During the beta a new
 * tree is by request: the first press asks a reviewer and says so in a
 * dialog, and pressing again only shows the dialog. Once they're approved
 * it's a link to naming the tree; once they've founded one, nothing — it's
 * one each.
 */
export function StartTreeButton({
  status,
  children,
  pendingLabel,
  ...look
}: {
  status: TreeRequestStatus;
  children: React.ReactNode;
  /** The label once they've asked, if it should change. */
  pendingLabel?: React.ReactNode;
} & ButtonLook) {
  const router = useRouter();
  const [asked, setAsked] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // No refresh after asking: the page would re-render around the dialog.
  const current: TreeRequestStatus =
    asked && status === "none" ? "pending" : status;

  if (current === "founded") return null;
  if (current === "approved") {
    return (
      <Button nativeButton={false} render={<Link href={newTreeHref()} />} {...look}>
        {children}
      </Button>
    );
  }

  async function onClick() {
    if (current === "pending") {
      setOpen(true);
      return;
    }
    setBusy(true);
    let res: Awaited<ReturnType<typeof requestNewTree>>;
    try {
      res = await requestNewTree();
    } catch {
      toast.error("Couldn't reach the server — reload the page and try again.");
      return;
    } finally {
      setBusy(false);
    }
    if (res.error || !res.status) {
      toast.error(res.error ?? "Couldn't send your request. Try again.");
      return;
    }
    if (res.status === "approved") {
      router.push(newTreeHref());
      return;
    }
    if (res.status === "founded") {
      router.refresh();
      return;
    }
    setAsked(true);
    setOpen(true);
  }

  return (
    <>
      <Button type="button" onClick={onClick} disabled={busy} {...look}>
        {busy ? "Sending…" : current === "pending" && pendingLabel ? pendingLabel : children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request received</DialogTitle>
            <DialogDescription>{TREE_REQUEST_RECEIVED}</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </>
  );
}
