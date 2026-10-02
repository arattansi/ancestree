import type { Metadata } from "next";

import { CenteredPage } from "@/components/page-column";

export const metadata: Metadata = { title: "who" };

/**
 * /about-us, "who" (Step 107): the title alone over the Elevators tree
 * until Aalim's copy and styling for it arrive. Lower-case as Aalim wrote it.
 */
export default function AboutUsPage() {
  return (
    <CenteredPage>
      <h1 className="text-4xl font-semibold tracking-tight">who</h1>
    </CenteredPage>
  );
}
