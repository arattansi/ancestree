import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSelfPerson } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Family tree",
  description: "Collaborative family tree canvas (coming soon).",
};

// Placeholder for the canvas tree (built in Step 6 — Tree visualization).
export default async function TreePage() {
  const profile = await requireSelfPerson();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>Welcome, {profile.display_name ?? "family"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-muted-foreground">
          <p>
            The interactive tree canvas lands in Step 6. You can already add
            relatives and connect them to the tree.
          </p>
          <Button nativeButton={false} render={<Link href="/people/new" />}>
            Add a relative
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
