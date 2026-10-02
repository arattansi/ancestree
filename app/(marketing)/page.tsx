import Link from "next/link";

import { BetaWaitlistDialog } from "@/components/beta-waitlist-dialog";
import { LogoMark } from "@/components/logo-mark";
import { CenteredPage } from "@/components/page-column";
import { RequestAccessDialog } from "@/components/request-access";
import { StartTreeButton } from "@/components/start-tree-button";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { homeHref } from "@/lib/tree-links";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

/**
 * The landing page (Step 28). Signed in: view your tree (My Family Tree,
 * Step 92.5), or ask to start a new one. Signed out: sign in, join a tree
 * (which looks for your family's tree first; "request access" until Step
 * 107), or join the waitlist to start one. New trees are by request during
 * the beta. Its buttons are lower-case, as every button is
 * (docs/design-system.md). Sign in stays the filled button, for members
 * coming back. Since Step 107 it's the first of the marketing pages, over
 * the Elevators tree (`app/(marketing)/layout.tsx`).
 */
export default async function Home() {
  const profile = await getProfile();
  const treeRequest = profile ? await getTreeRequestStatus() : null;

  return (
    <CenteredPage className="gap-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-16" />
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-4xl font-semibold tracking-tight">ancestree</h1>
          <p className="text-sm font-medium tracking-wide text-foreground [font-variant:small-caps]">
            a space to grow your tree.
          </p>
        </div>
        <div className="flex max-w-md flex-col gap-2 text-lg text-muted-foreground">
          <p>
            collaborative, by invite, with the people who know best: your
            family.
          </p>
        </div>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        {profile ? (
          <>
            <Button
              nativeButton={false}
              render={<Link href={homeHref(profile.self_person_id)} />}
              size="lg"
            >
              view your tree
            </Button>
            <StartTreeButton status={treeRequest ?? "none"} size="lg" variant="outline">
              start a tree (beta)
            </StartTreeButton>
          </>
        ) : (
          <>
            <Button nativeButton={false} render={<Link href="/join" />} size="lg">
              sign in
            </Button>
            <RequestAccessDialog size="lg" variant="outline">
              join a tree
            </RequestAccessDialog>
            <BetaWaitlistDialog size="lg" variant="outline">
              start a tree (beta)
            </BetaWaitlistDialog>
          </>
        )}
      </div>
    </CenteredPage>
  );
}
