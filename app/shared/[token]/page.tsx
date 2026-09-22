import type { Metadata } from "next";
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
  const link = await resolveShareLink(token);

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
  const [{ people, relationships }, anchorIds, pets, { data: tree }] =
    await Promise.all([
      // No `withAccountTypes`: who has an account is for members only, and the
      // admin client here would read every profile (Step 19.1).
      getTreeGraph(link.treeId, admin),
      getTreeAnchors(link.treeId, admin),
      getTreePets(link.treeId, admin),
      admin.from("trees").select("slug").eq("id", link.treeId).maybeSingle(),
    ]);

  return (
    <main className="flex flex-1 flex-col">
      <FamilyTree
        people={people}
        relationships={relationships}
        treeId={link.treeId}
        treeSlug={tree?.slug ?? ""}
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
      />
    </main>
  );
}
