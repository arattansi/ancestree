import Link from "next/link";

import { LogoMark } from "@/components/logo-mark";
import { ElevatorsTree } from "@/components/marketing/elevators-tree";
import { CenteredPage } from "@/components/page-column";
import { RequestAccessDialog } from "@/components/request-access";
import { StartTreeButton } from "@/components/start-tree-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import { campaignHref, HOME_CAMPAIGN_CODE } from "@/lib/campaigns";
import { homeHref } from "@/lib/tree-links";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

/**
 * The landing page (Step 28). Signed in: view your tree (My Family Tree,
 * Step 92.5), or start a new one. Signed out: sign in, join a tree (which
 * looks for your family's tree first; "request access" until Step 107), or
 * start a tree: sign up through the home page's own campaign link, which
 * starts it at once (Step 119; a waitlist and a reviewer's yes until then).
 * "free to use" (Step 120) sits under "a space to grow your tree." (Step
 * 123).
 * Its buttons are lower-case, as every button is
 * (docs/design-system.md). Sign in stays the filled button, for members
 * coming back. Since Step 107 it's the first of the marketing pages, and the
 * only one over the Elevators tree: the other marketing pages are plain. Its
 * `main` lets the pointer through wherever it draws nothing, so the leaves
 * answer a hover there and its own words and buttons still work.
 */
export default async function Home() {
  const profile = await getProfile();
  const treeRequest = profile ? await getTreeRequestStatus() : null;

  return (
    <div className="relative isolate flex flex-1 flex-col">
      <ElevatorsTree className="absolute inset-0 -z-10" />
      <div className="pointer-events-none flex flex-1 flex-col [&_main>*]:pointer-events-auto">
        <CenteredPage className="gap-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <LogoMark className="size-16" />
            <div className="flex flex-col items-center gap-1">
              <h1 className="text-4xl font-semibold tracking-tight">ancestree</h1>
              <p className="text-sm font-medium tracking-wide text-foreground [font-variant:small-caps]">
                a space to grow your tree.
              </p>
              {/* The logo's green, with near-black words: white on it fails
                  contrast, and it's the same green in both themes. */}
              <Badge className="mt-2.5 bg-brand-green text-neutral-950">
                free to use
              </Badge>
            </div>
            <div className="flex max-w-xl flex-col gap-2 text-lg text-muted-foreground">
              <p className="text-balance">
                collaborative with the people who know best: your family.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col items-center">
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
                    start a tree
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
                  <Button
                    nativeButton={false}
                    render={<Link href={campaignHref(HOME_CAMPAIGN_CODE)} />}
                    size="lg"
                    variant="outline"
                  >
                    start a tree
                  </Button>
                </>
              )}
            </div>
          </div>
        </CenteredPage>
      </div>
    </div>
  );
}
