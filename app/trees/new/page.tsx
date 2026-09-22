import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FoundTreeForm } from "@/components/found-tree-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listMyTrees } from "@/lib/tree-context";
import { adminHref, treesHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "start a tree",
  description: "Start a family tree of your own on ancestree.",
};

export default async function NewTreePage() {
  const profile = await requireProfile();
  const trees = await listMyTrees();

  // One founded tree each: a founder is sent to the one they have.
  const founded = trees.find((t) => t.founded);
  if (founded) redirect(adminHref(founded.slug));

  // Suggest the family name from their own entry.
  let suggestedName = profile.display_name ? `${profile.display_name}’s tree` : "Our family tree";
  if (profile.self_person_id) {
    const supabase = await createClient();
    const { data: self } = await supabase
      .from("people")
      .select("last_name, maiden_name")
      .eq("id", profile.self_person_id)
      .maybeSingle();
    const family = self?.maiden_name || self?.last_name;
    if (family) suggestedName = `The ${family} family`;
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Start a tree of your own
        </h1>
        <p className="text-sm text-muted-foreground">
          A separate canvas for your side of the family, with you as its first
          Root. You stay on{" "}
          {trees.length === 1 ? trees[0].name : "the trees you belong to"} as
          you are now — one entry, shown in both places.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your tree</CardTitle>
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

      <p className="text-sm text-muted-foreground">
        <Link href={treesHref()} className="underline underline-offset-4">
          Back to your trees
        </Link>
      </p>
    </main>
  );
}
