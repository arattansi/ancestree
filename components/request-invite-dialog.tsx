"use client";

import * as React from "react";

import { lazyComponent, useLoadedSoon } from "@/components/lazy-component";
import { Button } from "@/components/ui/button";

const Popup = lazyComponent(() =>
  import("@/components/request-invite-form").then(
    (m) => m.RequestInviteDialogPopup,
  ),
);

/**
 * The share link's "Ask to join" (Step 41.4): the request form in a dialog
 * over the read-only canvas, so asking doesn't cost the viewer their place
 * in the tree. A visitor from another tree has the same button. The form's
 * code comes once the canvas has painted, and the dialog is mounted, closed,
 * from then on (Step 87.4, audit C1).
 */
export function RequestInviteDialog({
  treeSlug,
  signedIn = false,
  children,
  ...look
}: {
  treeSlug: string;
  /** A visitor is signed in already, so isn't offered a sign-in. */
  signedIn?: boolean;
  children: React.ReactNode;
} & Pick<React.ComponentProps<typeof Button>, "size" | "variant" | "className">) {
  const button = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [opened, setOpened] = React.useState(false);
  const [ready, loadNow] = useLoadedSoon(Popup.preload);
  return (
    <>
      <Button
        ref={button}
        {...look}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={ready ? undefined : loadNow}
        onFocus={ready ? undefined : loadNow}
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
      >
        {children}
      </Button>
      {ready || opened ? (
        <Popup
          open={open}
          onOpenChange={setOpen}
          treeSlug={treeSlug}
          signedIn={signedIn}
          finalFocus={button}
        />
      ) : null}
    </>
  );
}
