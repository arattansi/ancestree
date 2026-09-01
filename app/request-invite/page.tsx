import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RequestInviteForm } from "@/components/request-invite-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProfile } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Request an invite",
  description: "Ask an ancestree admin for an invite to the family tree.",
};

export default async function RequestInvitePage() {
  const profile = await getProfile();
  if (profile) redirect("/tree");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Request an invite</CardTitle>
          <CardDescription>
            ancestree is invite-only. Tell us who you are and an admin will
            review your request.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RequestInviteForm />
          <p className="text-sm text-muted-foreground">
            Already have an invite?{" "}
            <Link href="/join" className="underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
