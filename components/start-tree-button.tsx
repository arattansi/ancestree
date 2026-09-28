"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { requestNewTree } from "@/app/actions/tree-requests";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAction } from "@/components/use-action";
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
  const action = useAction();
  // Pending as soon as they've asked, before the page is drawn again with
  // the ask (the action does that).
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

  function onClick() {
    if (current === "pending") {
      setOpen(true);
      return;
    }
    action.run(
      "ask",
      async (): Promise<Awaited<ReturnType<typeof requestNewTree>>> => {
        const res = await requestNewTree();
        return res.error || !res.status
          ? { error: res.error ?? "Couldn't send your request. Try again." }
          : res;
      },
      {
        // Busy until what comes next is on screen, so a second tap can't
        // ask again.
        onSuccess: ({ status }) => {
          if (status === "approved") {
            router.push(newTreeHref());
            return;
          }
          if (status === "founded") return;
          setAsked(true);
          setOpen(true);
        },
      },
    );
  }

  return (
    <>
      <PendingButton
        type="button"
        onClick={onClick}
        pending={action.pending}
        pendingLabel="Sending…"
        {...look}
      >
        {current === "pending" && pendingLabel ? pendingLabel : children}
      </PendingButton>
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
