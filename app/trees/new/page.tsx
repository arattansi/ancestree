import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StartTreeForm } from "@/components/start-tree-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSelfPerson } from "@/lib/auth";
import { multiTreeEnabled } from "@/lib/flags";
import { getSharedTree, listTreeMembers } from "@/lib/tree";

export const metadata: Metadata = {
  title: "Start your own tree",
  description: "Create your own family tree and bridge it to the shared one.",
};

export default async function NewTreePage() {
  if (!multiTreeEnabled) redirect("/tree");

  const profile = await requireSelfPerson();
  const tree = await getSharedTree();
  if (!tree) redirect("/onboarding");

  const members = await listTreeMembers(tree.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Start your own tree
        </h1>
        <p className="text-sm text-muted-foreground">
          Spin up a separate tree that stays linked to this one through a
          marriage / partnership. This is an early preview — the second tree
          isn&apos;t drawn on the canvas yet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New tree</CardTitle>
          <CardDescription>
            Signed in as {profile.display_name ?? "a member"}.{" "}
            <Link href="/tree" className="underline underline-offset-4">
              Back to the tree
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StartTreeForm members={members} />
        </CardContent>
      </Card>
    </main>
  );
}
