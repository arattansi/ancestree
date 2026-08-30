import type { Metadata } from "next";

import { AddPersonFlow } from "@/components/add-person-flow";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSelfPerson } from "@/lib/auth";
import { getSharedTree, listTreeMembers } from "@/lib/tree";

export const metadata: Metadata = {
  title: "Add a relative",
  description: "Add a relative and connect them to the family tree.",
};

export default async function NewPersonPage() {
  const profile = await requireSelfPerson();
  const tree = await getSharedTree();

  if (!tree) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Add a relative</h1>
        <p className="text-sm text-muted-foreground">
          The family tree isn&apos;t set up yet.
        </p>
      </main>
    );
  }

  const members = await listTreeMembers(tree.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a relative</h1>
        <p className="text-sm text-muted-foreground">
          New entries must connect to someone already in the tree. Add any
          missing people in between as part of the same step.
        </p>
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
            isAdmin={profile.role === "admin"}
            members={members}
          />
        </CardContent>
      </Card>
    </main>
  );
}
