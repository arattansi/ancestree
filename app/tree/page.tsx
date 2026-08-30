import type { Metadata } from "next";

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
        <CardContent className="text-muted-foreground">
          The interactive tree canvas lands in Step 6. Onboarding and the entry
          form arrive in Steps 4&ndash;5.
        </CardContent>
      </Card>
    </main>
  );
}
