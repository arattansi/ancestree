import type { Metadata } from "next";

import { CenteredPage } from "@/components/page-column";

export const metadata: Metadata = { title: "capitalism" };

/**
 * /pricing, "capitalism" (Step 107): its title and "details coming soon" over the
 * Elevators tree (Step 110) until Aalim's copy and styling for it arrive.
 * Lower-case as Aalim wrote them.
 */
export default function PricingPage() {
  return (
    <CenteredPage className="gap-3 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">capitalism</h1>
      <p className="text-muted-foreground">details coming soon</p>
    </CenteredPage>
  );
}
