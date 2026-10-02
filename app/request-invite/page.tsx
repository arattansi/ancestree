import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CenteredPage } from "@/components/page-column";
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
import { REQUEST_INVITE_INTRO } from "@/lib/request-forms";
import { homeHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "join a tree",
  description: "Find your family's tree on ancestree and ask to join it.",
};

/**
 * Asking to join. With `?tree=<slug>` the request goes straight to that
 * tree's Roots: the share link's "Ask to join" form, which opens in a dialog
 * over the canvas since Step 41.4, kept here as a page for emails and older
 * links. Without one it's the home page's "join a tree" flow: find the
 * family's tree first (Step 28), with no line under its title (Step 107).
 */
export default async function RequestInvitePage({
  searchParams,
}: PageProps<"/request-invite">) {
  const profile = await getProfile();
  // A member has nothing to ask for: their landing (Step 92.5).
  if (profile) redirect(homeHref(profile.self_person_id));
  const { tree } = await searchParams;
  const treeSlug = typeof tree === "string" && tree ? tree : null;

  return (
    <CenteredPage>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{treeSlug ? "Request an Invite" : "Join a Tree"}</CardTitle>
          {treeSlug ? <CardDescription>{REQUEST_INVITE_INTRO}</CardDescription> : null}
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
    </CenteredPage>
  );
}
