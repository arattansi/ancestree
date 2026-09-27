import type { Metadata } from "next";
import Link from "next/link";

import { AddPersonFlow } from "@/components/add-person-flow";
import { Card, CardContent } from "@/components/ui/card";
import { getOwnLine } from "@/lib/branch.server";
import { getBloodline, getGrowthRights } from "@/lib/growth-rights.server";
import { listTreeMembers } from "@/lib/tree";
import { requireTreeSelfPerson } from "@/lib/tree-context";
import { newTreeHref, validRelatedTo } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "add a relative",
  description: "Add a relative and connect them to the family tree.",
};

export default async function NewPersonPage({
  searchParams,
}: PageProps<"/people/new">) {
  const { tree, type, profile, isRoot } = await requireTreeSelfPerson();

  // A Leaf adds on their own line (Step 34), so connects new entries from
  // someone on it; the database judges the result at submit. The bloodline
  // lets the form warn of a missing blood tie before then (Step 55).
  const [members, rights, line, bloodline] = await Promise.all([
    listTreeMembers(tree.id),
    getGrowthRights(tree.id),
    type.addRelatives === "line" && profile.self_person_id
      ? getOwnLine(tree.id, profile.self_person_id)
      : null,
    getBloodline(tree.id),
  ]);
  // "Add a relative" with someone selected on the canvas (Step 19.2): start
  // the flow connected to them. Only an id on this tree they may add from is
  // honoured; the growth rights and the bloodline gate still judge the result
  // at submit.
  const { relatedTo } = await searchParams;
  const initialAnchorId = validRelatedTo(
    relatedTo,
    members.flatMap((m) => (!line || line.has(m.id) ? [m.id] : [])),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      {/* No line under the title on what the form asks; the form shows it
          (Step 58). Only a member who can't add just anyone is told the rule. */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Add a relative
        </h1>
        {rights.isMarriedIn ? (
          // Say the rule up front for a member who married in, rather than
          // letting them fill the whole form and meet the gate at submit.
          <p className="text-sm text-muted-foreground">
            You can add your partner&apos;s relatives and the children you
            share. Your own side belongs on{" "}
            <Link href={newTreeHref()} className="underline underline-offset-4">
              a tree of your own
            </Link>
            .
          </p>
        ) : line ? (
          <p className="text-sm text-muted-foreground">
            As a Leaf, you can add your direct ancestors, anyone descended from
            them, and the people they married.
          </p>
        ) : null}
      </div>

      <Card>
        <CardContent>
          <AddPersonFlow
            mode="relative"
            treeId={tree.id}
            isAdmin={isRoot}
            members={members}
            initialAnchorId={initialAnchorId}
            anchorable={line}
            bloodline={bloodline}
            // Whoever may add a relative may invite them to claim the entry
            // they add, as `sendClaimInvite` allows (Step 22.1).
            canInvite
          />
        </CardContent>
      </Card>
    </main>
  );
}
