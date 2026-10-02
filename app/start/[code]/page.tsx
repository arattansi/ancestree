import type { Metadata } from "next";
import Link from "next/link";

import { CampaignStartButton } from "@/components/campaign-start-button";
import { MagicLinkForm } from "@/components/magic-link-form";
import { CenteredPage } from "@/components/page-column";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { openCampaign } from "@/lib/campaigns.server";
import { treesHref } from "@/lib/tree-links";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

export const metadata: Metadata = {
  title: "start a tree",
  description: "Start your family tree on ancestree.",
};

/**
 * A campaign link (Step 103.3): open to anyone, no approval. Signed out,
 * they sign up with their name and email and the code starts their tree;
 * a member starts theirs with one button. Opening it counts against the
 * campaign (`openCampaign`). Paused, or no such link, it says so.
 */
export default async function StartPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [state, profile] = await Promise.all([openCampaign(code), getProfile()]);
  const founded =
    state === "open" && profile ? (await getTreeRequestStatus()) === "founded" : false;

  return (
    <CenteredPage>
      <Card className="w-full max-w-md">
        {state === "open" && founded ? (
          <>
            <CardHeader>
              <CardTitle>You Have a Tree</CardTitle>
            </CardHeader>
            <CardContent>
              <Button className="w-full" nativeButton={false} render={<Link href={treesHref()} />}>
                my trees
              </Button>
            </CardContent>
          </>
        ) : state === "open" ? (
          <>
            <CardHeader>
              <CardTitle>Start Your Family Tree</CardTitle>
            </CardHeader>
            <CardContent>
              {profile ? (
                <CampaignStartButton code={code} />
              ) : (
                <MagicLinkForm campaign={code} />
              )}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                {state === "paused" ? "This Link Is Paused" : "Link Not Available"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <Link href="/" className="underline underline-offset-4">
                  Back home
                </Link>
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </CenteredPage>
  );
}
