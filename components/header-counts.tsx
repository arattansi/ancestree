"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { switchTreeForm } from "@/app/actions/current-tree";
import { SiteNavLink } from "@/components/site-nav-link";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import {
  countsStale,
  parseHeaderCounts,
  type HeaderCounts,
} from "@/lib/header-counts";
import { reviewHref } from "@/lib/tree-links";

type HeaderCountsValue = {
  counts: HeaderCounts;
  /** Goes up each time the server draws the header again: a save's reply, a full load. */
  drawn: number;
};

const Context = React.createContext<HeaderCountsValue | null>(null);

/** The counts as the server has them now, or `null` if they can't be had. */
async function fetchHeaderCounts(): Promise<HeaderCounts | null> {
  try {
    const res = await fetch("/api/header-counts", { cache: "no-store" });
    return res.ok ? parseHeaderCounts(await res.json()) : null;
  } catch {
    // Advisory: the counts stay as they were until the next ask.
    return null;
  }
}

/**
 * The header's counts, kept fresh (Step 77.2, audit S4 and N7). They come
 * drawn with the page, and again with each save's reply; moving to another
 * page doesn't draw the header again, so then, and on coming back to the
 * tab, they're asked for (`/api/header-counts`), at most every 30 s.
 */
export function HeaderCountsProvider({
  initial,
  children,
}: {
  initial: HeaderCounts;
  children: React.ReactNode;
}) {
  const [counts, setCounts] = React.useState(initial);
  const [seed, setSeed] = React.useState(initial);
  const [drawn, setDrawn] = React.useState(0);
  // A new drawing of the header brings new counts: they win.
  if (initial !== seed) {
    setSeed(initial);
    setCounts(initial);
    setDrawn((n) => n + 1);
  }

  // When the counts shown were read, which drawing they came with, and
  // whether an ask is on its way.
  const readAt = React.useRef(0);
  const drawnRef = React.useRef(drawn);
  const asking = React.useRef<Promise<HeaderCounts | null> | null>(null);
  React.useEffect(() => {
    readAt.current = Date.now();
    drawnRef.current = drawn;
  }, [seed, drawn]);

  /**
   * An ask, unless the counts are fresh or one is already on its way. Its
   * answer is kept only if the header wasn't drawn again meanwhile: a save's
   * reply knows better than an ask sent before it.
   */
  const ask = React.useCallback((): Promise<HeaderCounts | null> | null => {
    if (asking.current || !countsStale(readAt.current, Date.now())) return null;
    const sentWith = drawnRef.current;
    const pending = fetchHeaderCounts()
      .then((next) => (next && drawnRef.current === sentWith ? next : null))
      .finally(() => {
        asking.current = null;
      });
    asking.current = pending;
    return pending;
  }, []);

  const pathname = usePathname();
  React.useEffect(() => {
    ask()?.then((next) => {
      if (!next) return;
      readAt.current = Date.now();
      setCounts(next);
    });
  }, [pathname, ask]);

  React.useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      ask()?.then((next) => {
        if (!next) return;
        readAt.current = Date.now();
        setCounts(next);
      });
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [ask]);

  const value = React.useMemo(() => ({ counts, drawn }), [counts, drawn]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useHeaderCounts(): HeaderCountsValue {
  const value = React.useContext(Context);
  if (!value) throw new Error("useHeaderCounts needs a HeaderCountsProvider");
  return value;
}

/** **connections**, with how many wait on the tree, while any do. */
export function ConnectionsNavLink() {
  const { counts } = useHeaderCounts();
  if (counts.connections === 0) return null;
  return (
    <SiteNavLink href={reviewHref()}>
      connections
      <Badge variant="secondary" className="ml-1.5">
        {counts.connections}
      </Badge>
    </SiteNavLink>
  );
}

/**
 * The count beside **account** of what waits in the admin consoles they
 * run, which opens the card it's waiting on (Step 30.1).
 */
export function AdminQueueButton() {
  const { counts } = useHeaderCounts();
  const admin = counts.admin;
  if (!admin) return null;
  return (
    <form action={switchTreeForm.bind(null, admin.treeId, admin.href)}>
      <SubmitButton
        size="sm"
        // Yellow: it opens what's waiting. Red is for removing (Step 70).
        variant="attention"
        aria-label={admin.label}
        title={admin.label}
        className="relative tap-target tabular-nums"
      >
        {admin.count}
      </SubmitButton>
    </form>
  );
}
