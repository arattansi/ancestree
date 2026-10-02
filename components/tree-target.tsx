"use client";

import type { ComponentProps, MouseEvent, ReactNode } from "react";
import Link from "next/link";

import { switchTreeForm } from "@/app/actions/current-tree";
import { ActionButton } from "@/components/action-button";
import { navigateToAdminSection } from "@/components/admin/nav-event";
import { LinkPendingLabel } from "@/components/link-pending";
import { Button } from "@/components/ui/button";

type ButtonLook = Omit<
  ComponentProps<typeof Button>,
  "render" | "nativeButton" | "onClick" | "onError" | "action" | "children"
>;

/** A plain left click, which may open a page here rather than in a new tab. */
function plainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Opens a page on a tree (Step 77.3, audit N2). On the tree being looked at
 * it's an ordinary link, which loads only that page and opens in a new tab
 * too; on the canvas, a person on it opens without the page being drawn
 * again, and on the admin console, a section opens in place. On another
 * tree it's a button that switches first and stays busy until the page has
 * arrived. That one stays a button: the browser remembers which tree it's
 * looking at, not the address, so a link couldn't say.
 */
export function TreeTarget({
  treeId,
  currentTreeId,
  href,
  pendingLabel = "opening…",
  children,
  ...look
}: ButtonLook & {
  /** The tree the page is on. */
  treeId: string;
  /** The tree being looked at, if they're a member of it. */
  currentTreeId: string | null;
  href: string;
  pendingLabel?: string;
  children: ReactNode;
}) {
  if (treeId !== currentTreeId) {
    return (
      <ActionButton
        action={() => switchTreeForm(treeId, href)}
        pendingLabel={pendingLabel}
        {...look}
      >
        {children}
      </ActionButton>
    );
  }

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!plainClick(event)) return;
    // Where they are now, and where it goes.
    const here = new URL(window.location.href);
    const url = new URL(href, here);
    if (here.pathname === "/tree" && url.pathname === "/tree") {
      // The canvas opens whoever the address names (`?person=`): changing
      // the address is all it takes, with nothing fetched. It always names
      // whoever is open, so the same address means they're open already.
      event.preventDefault();
      if (url.href !== here.href) window.history.pushState(null, "", href);
    } else if (
      here.pathname === "/account" &&
      here.searchParams.get("view") === "admin" &&
      url.pathname === "/account" &&
      url.searchParams.get("view") === "admin" &&
      url.hash
    ) {
      // Already on the console: open the section rather than only
      // changing the address's #hash.
      event.preventDefault();
      navigateToAdminSection(url.hash.slice(1));
    }
  }

  return (
    // Never fetched ahead: the Root console does work as it's drawn (audit
    // N3), and a list of these — the bell's — would each have the server
    // draw a page nobody asked for. The label pulses once it's clicked.
    <Button
      nativeButton={false}
      render={<Link href={href} onClick={onClick} prefetch={false} />}
      {...look}
    >
      <LinkPendingLabel>{children}</LinkPendingLabel>
    </Button>
  );
}
