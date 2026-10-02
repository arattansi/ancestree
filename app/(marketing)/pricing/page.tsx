import type { Metadata } from "next";

import { CenteredPage } from "@/components/page-column";

export const metadata: Metadata = { title: "capitalism" };

/**
 * /pricing, "capitalism" (Step 107): the title alone over the Elevators tree
 * until Aalim's copy and styling for it arrive. Lower-case as Aalim wrote it.
 */
export default function PricingPage() {
  return (
    <CenteredPage>
      <h1 className="text-4xl font-semibold tracking-tight">capitalism</h1>
    </CenteredPage>
  );
}
