import type { Metadata } from "next";
import Link from "next/link";

import { unsubscribeFromStories } from "@/app/actions/library-subscribe";
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
import { BLOG_NAME, blogHref } from "@/lib/blog";
import { confirmSubscription, readSubscription } from "@/lib/library-subscribers.server";

export const metadata: Metadata = {
  title: BLOG_NAME,
  robots: { index: false },
};

/**
 * A subscription's link (Step 135): the confirm one (`?confirm=1`) puts it
 * on the list as it opens, the way a confirm link is meant to; the
 * Unsubscribe one in every post's email says where it stands and takes it
 * off only when the button is pressed, so a mail scanner following the
 * link can't.
 */
export default async function SubscriptionPage({
  params,
  searchParams,
}: PageProps<"/library/subscription/[token]">) {
  const [{ token }, { confirm }] = await Promise.all([params, searchParams]);
  const subscription =
    confirm === "1" ? await confirmSubscription(token) : await readSubscription(token);

  if (!subscription) {
    return (
      <CenteredPage>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link Not Found</CardTitle>
            <CardDescription>This link doesn&rsquo;t work.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" nativeButton={false} render={<Link href={blogHref()} />}>
              the library
            </Button>
          </CardContent>
        </Card>
      </CenteredPage>
    );
  }

  const on = subscription.confirmed && !subscription.unsubscribed;
  return (
    <CenteredPage>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Stories of Our Wise</CardTitle>
          <CardDescription>
            {confirm === "1"
              ? "You’re subscribed. A story will come whenever one is published."
              : on
                ? "You get a story whenever one is published."
                : subscription.unsubscribed
                  ? "You’re unsubscribed."
                  : "Not confirmed yet: use the link in the email we sent."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {on ? (
            <form action={unsubscribeFromStories.bind(null, token)}>
              <SubmitButton variant="outline" pendingLabel="unsubscribing…">
                unsubscribe
              </SubmitButton>
            </form>
          ) : null}
          <Button variant={on ? "ghost" : "outline"} nativeButton={false} render={<Link href={blogHref()} />}>
            the library
          </Button>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
