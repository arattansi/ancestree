import type { Metadata } from "next";

import { switchTreeForm } from "@/app/actions/current-tree";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { StartTreeButton } from "@/components/start-tree-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { listMyTrees } from "@/lib/tree-context";
import { adminHref, treeHref } from "@/lib/tree-links";
import { TREE_REQUEST_RECEIVED } from "@/lib/tree-requests";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

export const metadata: Metadata = {
  title: "your trees",
  description: "Every family tree you belong to.",
};

export default async function TreesPage() {
  await requireProfile();
  const [trees, request] = await Promise.all([
    listMyTrees(),
    getTreeRequestStatus(),
  ]);
  const founded = trees.some((t) => t.founded);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your Trees</h1>
        <p className="text-sm text-muted-foreground">
          You have one entry, shown on each tree that has brought you in. Your
          account type can differ from tree to tree.
        </p>
      </div>

      {trees.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            You&rsquo;re not on a tree yet. Accept an invite from a relative, or
            start one of your own below.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {trees.map((t) => (
            <li key={t.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle>{t.name}</CardTitle>
                      <CardDescription>
                        {t.personCount}{" "}
                        {t.personCount === 1 ? "entry" : "entries"} ·{" "}
                        {t.memberCount}{" "}
                        {t.memberCount === 1 ? "member" : "members"}
                        {t.founded ? " · founded by you" : ""}
                      </CardDescription>
                    </div>
                    <AccountTypeBadge role={t.role} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <form action={switchTreeForm.bind(null, t.id, treeHref())}>
                    <Button type="submit" size="sm">
                      Open the tree
                    </Button>
                  </form>
                  {t.type.runsTree ? (
                    <form action={switchTreeForm.bind(null, t.id, adminHref())}>
                      <Button type="submit" size="sm" variant="outline">
                        Admin
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {!founded ? (
        <Card>
          <CardHeader>
            <CardTitle>Start a Tree of Your Own</CardTitle>
            <CardDescription>
              For your own side of the family, with you as its first Root. Bring
              anyone you can see here along with you — they keep their one
              entry, and you arrange them on a canvas of your own.{" "}
              {request === "approved"
                ? null
                : request === "pending"
                  ? TREE_REQUEST_RECEIVED
                  : "New trees are in beta, so it starts with a request."}
            </CardDescription>
          </CardHeader>
          {request === "pending" ? null : (
            <CardContent>
              <StartTreeButton status={request} pendingLabel="Request sent">
                {request === "approved" ? "Start a tree" : "Ask to start a tree"}
              </StartTreeButton>
            </CardContent>
          )}
        </Card>
      ) : null}
    </main>
  );
}
