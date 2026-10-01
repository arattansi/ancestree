"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { requestNewTree } from "@/app/actions/tree-requests";
import { lazyComponent, useLoadedSoon } from "@/components/lazy-component";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { newTreeHref } from "@/lib/tree-links";
import type { TreeRequestStatus } from "@/lib/tree-requests";

const ReceivedDialog = lazyComponent(() =>
  import("@/components/request-received-dialog").then(
    (m) => m.RequestReceivedDialog,
  ),
);
/** Nothing to fetch: nobody is asking. */
const NOTHING = () => Promise.resolve();

type ButtonLook = Pick<
  React.ComponentProps<typeof Button>,
  "size" | "variant" | "className"
>;

/**
 * Asking to start a tree, wherever it's offered (Step 28): the header's
 * tree switcher (Step 92.2) as well as `StartTreeButton`. Where the ask
 * stands, pending from the moment they've asked; `start` asks, or, once
 * asked, shows that it's in; and the dialog that says so, to render where
 * it outlives whatever was pressed.
 */
export function useStartTree(status: TreeRequestStatus) {
  const router = useRouter();
  const [asked, setAsked] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const action = useAction();
  // Pending as soon as they've asked, before the page is drawn again with
  // the ask (the action does that).
  const current: TreeRequestStatus =
    asked && status === "none" ? "pending" : status;

  function start() {
    if (current === "approved") {
      router.push(newTreeHref());
      return;
    }
    if (current === "pending") {
      setOpen(true);
      return;
    }
    if (current === "founded") return;
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

  // Its code comes once the page has painted, and only while there's an ask
  // to make or show; then it's mounted, closed, so it opens as it always did
  // (Step 87.4, audit C1).
  const asking = current === "none" || current === "pending";
  const [ready] = useLoadedSoon(asking ? ReceivedDialog.preload : NOTHING);
  const dialog =
    asking && (ready || open) ? (
      <ReceivedDialog open={open} onOpenChange={setOpen} />
    ) : null;

  return { current, pending: action.pending, start, dialog };
}

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
  const { current, pending, start, dialog } = useStartTree(status);

  if (current === "founded") return null;
  if (current === "approved") {
    return (
      <Button nativeButton={false} render={<Link href={newTreeHref()} />} {...look}>
        {children}
      </Button>
    );
  }

  return (
    <>
      <PendingButton
        type="button"
        onClick={start}
        pending={pending}
        pendingLabel="Sending…"
        {...look}
      >
        {current === "pending" && pendingLabel ? pendingLabel : children}
      </PendingButton>
      {dialog}
    </>
  );
}
