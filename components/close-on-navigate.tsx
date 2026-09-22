"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Calls `onNavigate` once the page's address changes — for a drop-down
 * that should close after a link in it has led somewhere, rather than the
 * moment it's clicked. Reads the search params, so it sits in a Suspense
 * boundary wherever it's used.
 */
export function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const address = `${pathname}?${search}`;
  // The address it last saw, starting with the one it opened on. Comparing
  // against it, rather than skipping a first run, keeps the effect's other
  // runs quiet: StrictMode's second run on mount in dev, and a new callback
  // identity. Only a different address is a navigation.
  const last = React.useRef(address);
  React.useEffect(() => {
    if (address === last.current) return;
    last.current = address;
    onNavigate();
  }, [address, onNavigate]);
  return null;
}
