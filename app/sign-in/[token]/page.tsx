import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { SignInLinkForm } from "@/components/sign-in-link-form";
import { CenteredPage } from "@/components/page-column";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { DEFAULT_NEXT } from "@/lib/safe-next";
import { signInLinkHref } from "@/lib/sign-in-links";
import { readSignInLink } from "@/lib/sign-in.server";

export const metadata: Metadata = {
  title: "sign in",
  robots: { index: false, follow: false },
};

/**
 * A sign-in link a Root sent a member with no email (Step 202.3). Opening it
 * spends nothing: chat apps open links to draw their previews. The button
 * does (`signInWithLink`).
 */
export default async function SignInLinkPage({
  params,
}: PageProps<"/sign-in/[token]">) {
  const { token } = await params;
  const [link, sessionUser] = await Promise.all([readSignInLink(token), getSessionUser()]);

  if (!link || link.state !== "live") {
    return (
      <CenteredPage>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>This link no longer works</CardTitle>
            <CardDescription>Ask a Root of your tree for a new one.</CardDescription>
          </CardHeader>
        </Card>
      </CenteredPage>
    );
  }

  return (
    <CenteredPage>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in as {link.memberName}</CardTitle>
          <CardDescription>{link.treeName}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sessionUser?.id === link.userId ? (
            <>
              <p className="text-sm text-muted-foreground">You&rsquo;re signed in already.</p>
              <Button nativeButton={false} render={<Link href={DEFAULT_NEXT} />}>
                open the tree
              </Button>
            </>
          ) : sessionUser ? (
            // Someone else is signed in here: the button would switch this
            // browser to them, so they sign out first.
            <form action={signOut}>
              <input type="hidden" name="next" value={signInLinkHref(token)} />
              <p className="mb-4 text-sm text-muted-foreground">
                Someone else is signed in on this browser.
              </p>
              <SubmitButton className="w-full" pendingLabel="signing out…">
                sign out
              </SubmitButton>
            </form>
          ) : (
            <SignInLinkForm token={token} />
          )}
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
