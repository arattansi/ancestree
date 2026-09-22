import Link from "next/link";

import { BetaWaitlistDialog } from "@/components/beta-waitlist-dialog";
import { LogoMark } from "@/components/logo-mark";
import { RequestAccessDialog } from "@/components/request-access";
import { StartTreeButton } from "@/components/start-tree-button";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { treeHref } from "@/lib/tree-links";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

/**
 * The landing page (Step 26). Signed in: view your tree, or ask to start a
 * new one. Signed out: sign in, request access (which looks for your
 * family's tree first), or join the waitlist to start one. New trees are by
 * request during the beta. The buttons are navigation, so lower-case
 * (docs/design-system.md), even the ones that open a dialog.
 */
export default async function Home() {
  const profile = await getProfile();
  const treeRequest = profile ? await getTreeRequestStatus() : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
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
            Invite-only and collaborative with the people who know best: your
            family.
          </p>
        </div>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        {profile ? (
          <>
            <Button nativeButton={false} render={<Link href={treeHref()} />} size="lg">
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
              request access
            </RequestAccessDialog>
            <BetaWaitlistDialog size="lg" variant="outline">
              start a tree (beta)
            </BetaWaitlistDialog>
          </>
        )}
      </div>
    </main>
  );
}
