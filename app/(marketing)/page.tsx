import Link from "next/link";

import { LogoMark } from "@/components/logo-mark";
import { ElevatorsTree } from "@/components/marketing/elevators-tree";
import { CenteredPage } from "@/components/page-column";
import { RequestAccessDialog } from "@/components/request-access";
import { StartTreeButton } from "@/components/start-tree-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProfile, getSessionUser } from "@/lib/auth";
import { campaignHref, HOME_CAMPAIGN_CODE } from "@/lib/campaigns";
import { homeHref } from "@/lib/tree-links";
import { getTreeRequestStatus } from "@/lib/tree-requests.server";

/**
 * The landing page (Step 28). Signed in: view your tree (My Family Tree,
 * Step 92.5), or start a new one. Signed out: start a tree, filled — sign
 * up through the home page's own campaign link, which starts it at once
 * (Step 119; a waitlist and a reviewer's yes until then) — or join a tree,
 * which looks for your family's tree first ("request access" until Step
 * 107). Members coming back sign in from the header: "sign in" was the
 * filled button here until Step 160, and new addresses took it, landing
 * with no tree. Signed in but not a member yet (a new address), join a
 * tree is /join, which looks with the address they've verified.
 * "free to use" (Step 120) sits under the tagline (Step 123). The tagline,
 * the line under it and the one under the buttons are the Marketing Site
 * page's in Notion since Step 188; its footer's "an r+s production." is in
 * `site-footer.tsx`. Step 195 added "we make it" to the line under the
 * buttons.
 * Its buttons are lower-case, as every button is (docs/design-system.md).
 * Since Step 107 it's the first of the marketing pages, and the only one
 * over the Elevators tree: the other marketing pages are plain. Its
 * `main` lets the pointer through wherever it draws nothing, so the leaves
 * answer a hover there and its own words and buttons still work.
 */
export default async function Home() {
  const profile = await getProfile();
  const treeRequest = profile ? await getTreeRequestStatus() : null;
  const signedInNotMember = profile ? false : Boolean(await getSessionUser());

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
                the family tree you grow together.
              </p>
              {/* The logo's green, with near-black words: white on it fails
                  contrast, and it's the same green in both themes. */}
              <Badge className="mt-2.5 bg-brand-green text-neutral-950">
                free to use
              </Badge>
            </div>
            <div className="flex max-w-xl flex-col gap-2 text-lg text-muted-foreground">
              <p className="text-balance">
                a private, invite-only tree for your whole family, with audio
                stories, tagged photos and chat.
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
                  <Button
                    nativeButton={false}
                    render={<Link href={campaignHref(HOME_CAMPAIGN_CODE)} />}
                    size="lg"
                  >
                    start a tree
                  </Button>
                  {signedInNotMember ? (
                    <Button
                      nativeButton={false}
                      render={<Link href="/join" />}
                      size="lg"
                      variant="outline"
                    >
                      join a tree
                    </Button>
                  ) : (
                    <RequestAccessDialog size="lg" variant="outline">
                      join a tree
                    </RequestAccessDialog>
                  )}
                </>
              )}
            </div>
          </div>
          <p className="max-w-xl text-sm text-balance text-muted-foreground">
            whatever you grow stays yours: we make it easy to take back your
            data, always.
          </p>
        </CenteredPage>
      </div>
    </div>
  );
}
