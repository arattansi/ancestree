import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RequestAccessFlow } from "@/components/request-access";
import { RequestInviteForm, SignInInstead } from "@/components/request-invite-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { REQUEST_ACCESS_INTRO, REQUEST_INVITE_INTRO } from "@/lib/request-forms";

export const metadata: Metadata = {
  title: "request access",
  description: "Find your family's tree on ancestree and ask to join it.",
};

/**
 * Asking to join. With `?tree=<slug>` the request goes straight to that
 * tree's Roots: the share link's "Ask to join" form, which opens in a dialog
 * over the canvas since Step 41.4, kept here as a page for emails and older
 * links. Without one it's the home page's request-access flow: find the
 * family's tree first (Step 28).
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
            {treeSlug ? REQUEST_INVITE_INTRO : REQUEST_ACCESS_INTRO}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {treeSlug ? (
            <>
              <RequestInviteForm treeSlug={treeSlug} />
              <SignInInstead />
            </>
          ) : (
            <RequestAccessFlow />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
