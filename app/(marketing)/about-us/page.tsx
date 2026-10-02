import type { Metadata } from "next";

import { PageColumn } from "@/components/page-column";

export const metadata: Metadata = { title: "who" };

/**
 * /about-us, "who" in the menu (Step 107): its heading is the page's real
 * name, in brackets, with "details coming soon" under it, in the privacy
 * page's column and type, over the Elevators tree (Step 110) until Aalim's
 * copy for it arrives.
 */
export default function AboutUsPage() {
  return (
    <PageColumn>
      <h1 className="text-2xl font-semibold tracking-tight">(about us)</h1>
      <p className="text-sm text-muted-foreground">details coming soon</p>
    </PageColumn>
  );
}
