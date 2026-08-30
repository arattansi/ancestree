import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PersonForm } from "@/components/person-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Add yourself",
  description: "Create your own entry to join the family tree.",
};

export default async function OnboardingPage() {
  const profile = await requireProfile();
  if (profile.self_person_id) redirect("/tree");

  const supabase = await createClient();
  const { data: tree } = await supabase
    .from("trees")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Start by adding your own entry. You can connect yourself to relatives
          in the next step.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your entry</CardTitle>
          <CardDescription>
            Only a name and country of birth are required — add the rest whenever
            you like.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PersonForm
            mode="onboarding"
            treeId={tree.id}
            isAdmin={profile.role === "admin"}
          />
        </CardContent>
      </Card>
    </main>
  );
}
