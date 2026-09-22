import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RequestAccessFlow } from "@/components/request-access";
import { RequestInviteForm } from "@/components/request-invite-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { REQUEST_ACCESS_INTRO } from "@/lib/request-forms";

export const metadata: Metadata = {
  title: "request access",
  description: "Find your family's tree on ancestree and ask to join it.",
};

/**
 * Asking to join. With `?tree=<slug>` (a share link's "request access", a
 * visitor's "request edit access") the request goes straight to that tree's
 * Roots. Without one it's the home page's request-access flow: find the
 * family's tree first (Step 26).
 */
export default async function RequestInvitePage({
  searchParams,
}: PageProps<"/request-invite">) {
  const profile = await getProfile();
  if (profile) redirect("/tree");
  const { tree } = await searchParams;
  const treeSlug = typeof tree === "string" && tree ? tree : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{treeSlug ? "Request an Invite" : "Request Access"}</CardTitle>
          <CardDescription>
            {treeSlug
              ? "ancestree is invite-only. Tell us who you are and an admin will review your request."
              : REQUEST_ACCESS_INTRO}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {treeSlug ? (
            <>
              <RequestInviteForm treeSlug={treeSlug} />
              <p className="text-sm text-muted-foreground">
                Already have an invite?{" "}
                <Link href="/join" className="underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <RequestAccessFlow />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
