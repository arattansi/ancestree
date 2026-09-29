import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { FamilyTree } from "@/components/tree/family-tree";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { viewerUserAgent } from "@/lib/share-links";
import { resolveShareLink } from "@/lib/share-links.server";
import { getTreePets } from "@/lib/pets";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTreeAnchors, getTreeGraph } from "@/lib/tree";

export const metadata: Metadata = {
  title: "shared family tree",
  description: "A read-only view of a family tree on ancestree.",
  robots: { index: false, follow: false },
};

export default async function SharedTreePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // A link preview gets the page too, and so may asking to join, whose reply
  // draws the page again for someone signed in (Step 41.4); only a browser's
  // visit is a view.
  const link = await resolveShareLink(token, viewerUserAgent(await headers()));

  if (!link) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link not available</CardTitle>
            <CardDescription>
              This share link is invalid, has been turned off, or has expired.
              Ask the family member who sent it for a fresh one.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              nativeButton={false}
              render={<Link href="/request-invite" />}
            >
              Request access
            </Button>
            <p className="text-sm text-muted-foreground">
              <Link href="/" className="underline underline-offset-4">
                Back home
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const admin = createAdminClient();
  const [{ people, relationships }, anchorIds, pets] = await Promise.all([
    // The public read: who has an account is for members only (Step
    // 19.1), so no account types, claims or flags, and no user ids,
    // addresses or storage paths reach the browser (Step 61).
    getTreeGraph(link.treeId, admin, { forPublic: true }),
    getTreeAnchors(link.treeId, admin),
    getTreePets(link.treeId, admin, { forPublic: true }),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <FamilyTree
        people={people}
        relationships={relationships}
        treeId={link.treeId}
        treeSlug={link.treeSlug}
        selfPersonId={null}
        anchorIds={anchorIds}
        // Read-only: nobody tends anything here.
        rootIds={[]}
        currentUserId=""
        isAdmin={false}
        role="member"
        spokenForIds={[]}
        claimCandidates={[]}
        panelSuggestions={[]}
        pets={pets}
        readOnly
        shareToken={link.token}
      />
    </main>
  );
}
