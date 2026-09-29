import type { Metadata } from "next";
import Link from "next/link";

import { PageColumn } from "@/components/page-column";
import { ConnectionReview } from "@/components/tree/connection-review";
import { Button } from "@/components/ui/button";
import { auditTreeConnections } from "@/lib/connection-suggestions.server";
import { requireTreeSelfPersonWith } from "@/lib/tree-context";
import { treeHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "connections to review",
  description: "Connections the family tree implies but hasn't recorded.",
};

export default async function ConnectionReviewPage() {
  // The audit runs beside the check that their own entry is on this tree
  // (Step 77.1), and once for the page and the header's count of it.
  const { data: suggestions } = await requireTreeSelfPersonWith(({ tree }) =>
    auditTreeConnections(tree.id),
  );

  const duplicates = suggestions.filter(
    (s) => s.suggestedType === "duplicate_check",
  );
  const links = suggestions.filter(
    (s) => s.suggestedType !== "duplicate_check",
  );

  return (
    <PageColumn>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Connections to review</h1>
          <Button
            nativeButton={false}
            render={<Link href={treeHref()} />}
            size="sm"
            variant="outline"
          >
            back to the tree
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything the tree implies but doesn&apos;t record yet — worked out
          from who is partnered with whom, who shares parents, and who sits in
          the same place in the family. Answering one records it for everyone;
          saying no means we won&apos;t ask again.
        </p>
      </header>

      <ConnectionReview
        high={links.filter((s) => s.confidence === "high")}
        medium={links.filter((s) => s.confidence === "medium")}
        duplicates={duplicates}
      />
    </PageColumn>
  );
}
