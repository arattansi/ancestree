"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { withRedactedUrl } from "@/lib/analytics-url";

/**
 * Vercel's Web Analytics and Speed Insights (Step 220): page views, and how
 * fast each page loads for real visitors, in the project's Analytics and
 * Speed Insights tabs. Neither sets a cookie, so neither waits on the
 * consent banner. Both are told each page's address with its tokens taken
 * out (`lib/analytics-url.ts`), as Google Analytics is; the route they send
 * besides is the page's pattern (`/join/[token]`). In development they log
 * to the console and send nothing.
 */
export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={withRedactedUrl} />
      <SpeedInsights beforeSend={withRedactedUrl} />
    </>
  );
}
