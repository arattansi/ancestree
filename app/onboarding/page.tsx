import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingSelfFlow } from "@/components/onboarding-self-flow";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { getSharedTree, listTreeMembers } from "@/lib/tree";

export const metadata: Metadata = {
  title: "Find yourself",
  description:
    "Claim the entry a relative already added for you, or add your own.",
};

export default async function OnboardingPage() {
  const profile = await requireProfile();
  if (profile.self_person_id) redirect("/tree");

  const tree = await getSharedTree();

  if (!tree) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Add yourself</h1>
        <p className="text-sm text-muted-foreground">
          The family tree isn&apos;t set up yet. Ask an admin to finish setup,
          then try again.
        </p>
      </main>
    );
  }

  const members = await listTreeMembers(tree.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Let&apos;s find you on the family tree — or add you to it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your entry</CardTitle>
          <CardDescription>
            Start with your name — someone may have added you already.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingSelfFlow
            treeId={tree.id}
            isAdmin={profile.role === "admin"}
            members={members}
          />
        </CardContent>
      </Card>
    </main>
  );
}
