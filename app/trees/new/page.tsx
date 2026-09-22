import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FoundTreeForm } from "@/components/found-tree-form";
import { StartTreeButton } from "@/components/start-tree-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { listMyTrees } from "@/lib/tree-context";
import { adminHref, treesHref } from "@/lib/tree-links";
import { defaultTreeName } from "@/lib/tree-names";
import { TREE_REQUEST_RECEIVED } from "@/lib/tree-requests";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

export const metadata: Metadata = {
  title: "start a tree",
  description: "Start a family tree of your own on ancestree.",
};

export default async function NewTreePage() {
  await requireProfile();
  const [trees, request] = await Promise.all([
    listMyTrees(),
    getTreeRequestStatus(),
  ]);

  // One founded tree each: a founder is sent to the one they have.
  const founded = trees.find((t) => t.founded);
  if (founded) redirect(adminHref(founded.slug));

  // "My Family Tree" for a first tree, "My Second Tree" after that.
  const suggestedName = defaultTreeName(trees.length);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Start a Tree of Your Own
        </h1>
        <p className="text-sm text-muted-foreground">
          A separate canvas for your side of the family, with you as its first
          Root. You stay on{" "}
          {trees.length === 1 ? trees[0].name : "the trees you belong to"} as
          you are now — one entry, shown in both places.
        </p>
      </div>

      {request === "approved" ? (
        <Card>
          <CardHeader>
            <CardTitle>Your Tree</CardTitle>
            <CardDescription>
              It starts empty. Once it&rsquo;s planted you can bring yourself,
              your children, and anyone else you can see on your other trees
              across — a member&rsquo;s own entry waits for them to say yes.
              Everyone keeps one entry; each tree just chooses who it shows.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FoundTreeForm suggestedName={suggestedName} />
          </CardContent>
        </Card>
      ) : (
        // Step 26: during the beta a new tree is by request.
        <Card>
          <CardHeader>
            <CardTitle>New Trees Are in Beta</CardTitle>
            <CardDescription>
              {request === "pending"
                ? TREE_REQUEST_RECEIVED
                : "For now, a new tree starts with a request. Ask, and we’ll notify you when you can start building yours."}
            </CardDescription>
          </CardHeader>
          {request === "none" ? (
            <CardContent>
              <StartTreeButton status="none" pendingLabel="Request sent">
                Ask to start a tree
              </StartTreeButton>
            </CardContent>
          ) : null}
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href={treesHref()} className="underline underline-offset-4">
          Back to your trees
        </Link>
      </p>
    </main>
  );
}
