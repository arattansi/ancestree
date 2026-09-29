import type { Metadata } from "next";

import { AccountTypeBadge } from "@/components/account-type-badge";
import { PageColumn } from "@/components/page-column";
import { StartTreeButton } from "@/components/start-tree-button";
import { TreeTarget } from "@/components/tree-target";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { plural } from "@/lib/plural";
import { currentAccess, listMyTrees } from "@/lib/tree-context";
import { adminHref, treeHref } from "@/lib/tree-links";
import { TREE_REQUEST_RECEIVED } from "@/lib/tree-requests";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

export const metadata: Metadata = {
  title: "your trees",
  description: "Every family tree you belong to.",
};

export default async function TreesPage() {
  // Asked for together (Step 77.1): the trees need only the session.
  const [, trees, request, access] = await Promise.all([
    requireProfile(),
    listMyTrees(),
    getTreeRequestStatus(),
    currentAccess(),
  ]);
  // The tree they're looking at opens with a plain link (Step 77.3).
  const currentTreeId =
    access?.kind === "member" ? access.membership.tree.id : null;
  const founded = trees.some((t) => t.founded);

  return (
    <PageColumn width="lg">
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
                        {plural(t.personCount, "entry", "entries")} ·{" "}
                        {t.memberCount}{" "}
                        {plural(t.memberCount, "member")}
                        {t.founded ? " · founded by you" : ""}
                      </CardDescription>
                    </div>
                    <AccountTypeBadge role={t.role} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <TreeTarget
                    treeId={t.id}
                    currentTreeId={currentTreeId}
                    href={treeHref()}
                    size="sm"
                  >
                    Open the tree
                  </TreeTarget>
                  {t.type.runsTree ? (
                    <TreeTarget
                      treeId={t.id}
                      currentTreeId={currentTreeId}
                      href={adminHref()}
                      size="sm"
                      variant="outline"
                    >
                      Root console
                    </TreeTarget>
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
    </PageColumn>
  );
}
