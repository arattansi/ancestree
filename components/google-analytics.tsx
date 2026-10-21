"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import * as React from "react";

import { redactedUrl } from "@/lib/analytics-url";

/**
 * Calls `send` once the page has a title: opening a page, the router takes
 * the old one down a moment before the new one streams in. Not past a
 * second, nor past the next page opening.
 */
function whenTitled(send: () => void): () => void {
  if (document.title) {
    send();
    return () => {};
  }
  let sent = false;
  const done = () => {
    if (sent) return;
    sent = true;
    observer.disconnect();
    clearTimeout(timer);
    send();
  };
  const observer = new MutationObserver(() => {
    if (document.title) done();
  });
  observer.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  const timer = setTimeout(done, 1000);
  return done;
}

/**
 * Google Analytics (Steps 137, 197): Google's tag, told each page's
 * address itself rather than reading the address bar, so it never sees a
 * token (`lib/analytics-url.ts`). Its own page views are off (in the
 * stream's settings too, for the router's: "page changes based on browser
 * history events"); this sends one for the first page and each page the
 * router opens after it, with the page before as the referrer, both
 * redacted. `gtag` and the consent defaults come first, from
 * `consentDefaultScript` in the root layout.
 */
export function GoogleAnalytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // The last page counted, as the address bar had it and as Analytics saw it.
  const last = React.useRef<{ href: string; seen: string } | null>(null);

  React.useEffect(() => {
    const href = window.location.href.split("#")[0];
    if (last.current?.href === href) return;
    const seen = redactedUrl(href);
    const params = {
      page_location: seen,
      page_referrer: last.current?.seen ?? redactedUrl(document.referrer),
    };
    // For every event from here on (scrolls, engagement), not just the view.
    window.gtag?.("set", params);
    if (!last.current) {
      window.gtag?.("js", new Date());
      window.gtag?.("config", gaId, { send_page_view: false });
    }
    last.current = { href, seen };
    return whenTitled(() =>
      window.gtag?.("event", "page_view", { ...params, send_to: gaId }),
    );
  }, [gaId, pathname, search]);

  return (
    <Script
      id="google-analytics"
      src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
    />
  );
}
