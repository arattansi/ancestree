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
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onNavigate();
    // Only the address matters; a new callback identity shouldn't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);
  return null;
}
