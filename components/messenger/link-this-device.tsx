"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { messenger } from "@/components/messenger/messenger-store";
import { Button } from "@/components/ui/button";
import { MESSAGES_LINK_KEPT } from "@/lib/messenger";
import { myFamilyHref } from "@/lib/tree-links";

/** Where the link's fragment waits, also while a signed-out device signs in. */
const KEPT = MESSAGES_LINK_KEPT;

function keep(fragment: string | null) {
  try {
    if (fragment) sessionStorage.setItem(KEPT, fragment);
    else sessionStorage.removeItem(KEPT);
  } catch {
    // No session storage: the link can be opened again once signed in.
  }
}

function kept(): string | null {
  try {
    return sessionStorage.getItem(KEPT);
  } catch {
    return null;
  }
}

/**
 * Takes the keyring a member's other device left for this one (Step
 * 174.6): the link's fragment holds the transfer's id and the one-time key
 * that opens it. Signed out, it keeps the fragment for this tab and goes
 * to sign in, coming back here.
 */
export function LinkThisDevice({ userId }: { userId: string | null }) {
  const [state, setState] = React.useState<
    { kind: "working" } | { kind: "done" } | { kind: "failed"; message: string }
  >({ kind: "working" });

  const router = useRouter();
  // Once: a link is read only once, and development runs effects twice.
  const took = React.useRef(false);
  React.useEffect(() => {
    if (took.current) return;
    took.current = true;
    const fragment = window.location.hash.slice(1) || kept();
    // The key leaves the address bar before anything else happens.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!userId) {
      keep(fragment);
      router.push(`/join?next=${encodeURIComponent("/messages/link")}`);
      return;
    }
    keep(null);
    void (
      fragment
        ? messenger.takeDeviceLink(userId, fragment)
        : Promise.resolve("This link is missing its code. Make a new one on your other device.")
    ).then((problem) =>
      setState(problem ? { kind: "failed", message: problem } : { kind: "done" }),
    );
  }, [userId, router]);

  if (state.kind === "working") {
    return <p className="text-sm text-muted-foreground">Linking this device…</p>;
  }
  return (
    <div className="flex max-w-sm flex-col items-center gap-4">
      <h1 className="text-lg font-semibold">
        {state.kind === "done" ? "This Device Is Linked" : "Couldn’t Link This Device"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {state.kind === "done" ? "You can read your messages here now." : state.message}
      </p>
      <Button nativeButton={false} render={<Link href={myFamilyHref()} />}>
        open my family tree
      </Button>
    </div>
  );
}
