import type { Metadata } from "next";

import {
  LeafDemo,
  LeafDemoForm,
  LeafDemoTree,
} from "@/components/marketing/leaf-demo";
import { MarketingColumn } from "@/components/marketing/marketing-column";

export const metadata: Metadata = { title: "what + how" };

/**
 * /features, "what + how" in the menu (Step 107): its heading is the page's
 * real name, in brackets. Under it, in the column the other marketing pages
 * share, the add-a-relative form's basic fields, and beside them the leaves
 * they make (Step 112): a loop until the visitor tries it, nothing kept.
 */
export default function FeaturesPage() {
  return (
    <LeafDemo>
      <MarketingColumn aside={<LeafDemoTree />}>
        <h1 className="text-2xl font-semibold tracking-tight">
          (how to + features)
        </h1>
        <LeafDemoForm />
      </MarketingColumn>
    </LeafDemo>
  );
}
