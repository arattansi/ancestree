import type { Metadata } from "next";
import Link from "next/link";

import { ConnectionReview } from "@/components/tree/connection-review";
import { Button } from "@/components/ui/button";
import { requireSelfPerson } from "@/lib/auth";
import { auditTreeConnections } from "@/lib/connection-suggestions.server";
import { getSharedTree } from "@/lib/tree";

export const metadata: Metadata = {
  title: "connections to review",
  description: "Connections the family tree implies but hasn't recorded.",
};

export default async function ConnectionReviewPage() {
  await requireSelfPerson();
  const tree = await getSharedTree();
  const suggestions = tree ? await auditTreeConnections(tree.id) : [];

  const duplicates = suggestions.filter(
    (s) => s.suggestedType === "duplicate_check",
  );
  const links = suggestions.filter(
    (s) => s.suggestedType !== "duplicate_check",
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Connections to review</h1>
          <Button
            nativeButton={false}
            render={<Link href="/tree" />}
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
    </main>
  );
}
