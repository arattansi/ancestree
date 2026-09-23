import type { Metadata } from "next";
import Link from "next/link";

import { AddPersonFlow } from "@/components/add-person-flow";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOwnLine } from "@/lib/branch.server";
import { getGrowthRights } from "@/lib/growth-rights.server";
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
  // someone on it; the database judges the result at submit.
  const [members, rights, line] = await Promise.all([
    listTreeMembers(tree.id),
    getGrowthRights(tree.id),
    type.addRelatives === "line" && profile.self_person_id
      ? getOwnLine(tree.id, profile.self_person_id)
      : null,
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Add a relative
        </h1>
        <p className="text-sm text-muted-foreground">
          New entries must connect to someone already in the tree. Add any
          missing people in between as part of the same step.
        </p>
        {rights.isMarriedIn ? (
          // Say the rule up front for a member who married in, rather than
          // letting them fill the whole form and meet the gate at submit.
          <p className="mt-2 text-sm text-muted-foreground">
            You married into this family, so you can add your children and your
            partner&apos;s relatives here. Your own side of the family belongs
            on a tree of your own —{" "}
            <Link href={newTreeHref()} className="underline underline-offset-4">
              start one
            </Link>{" "}
            and bring anyone from here along with you.
          </p>
        ) : line ? (
          <p className="mt-2 text-sm text-muted-foreground">
            As a Leaf, you add relatives on your own line: your parents and
            grandparents as far back as you know, everyone descended from them,
            and the people they married. A Branch or a Root can add anyone
            else.
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Relative&apos;s entry</CardTitle>
          <CardDescription>
            A name and country of birth are required — everything else is
            optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddPersonFlow
            mode="relative"
            treeId={tree.id}
            isAdmin={isRoot}
            members={members}
            initialAnchorId={initialAnchorId}
            anchorable={line}
            // Whoever may add a relative may invite them to claim the entry
            // they add, as `sendClaimInvite` allows (Step 22.1).
            canInvite
          />
        </CardContent>
      </Card>
    </main>
  );
}
