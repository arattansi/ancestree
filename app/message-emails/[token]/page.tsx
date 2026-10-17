import type { Metadata } from "next";
import Link from "next/link";

import { setMessageEmailsFromLink } from "@/app/actions/message-emails";
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
import { readMessageEmailsByToken } from "@/lib/message-waiting.server";

export const metadata: Metadata = {
  title: "message emails",
  robots: { index: false },
};

/**
 * The link in an email telling a member a message waits for them (Step
 * 182), signed out: says whether those emails are on and turns them off,
 * or back on, as the getting started emails' page does. Opening it changes
 * nothing; the button does, so a mail scanner following the link can't.
 */
export default async function MessageEmailsPage({
  params,
}: PageProps<"/message-emails/[token]">) {
  const { token } = await params;
  const settings = await readMessageEmailsByToken(token);

  if (!settings) {
    return (
      <CenteredPage>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link Not Found</CardTitle>
            <CardDescription>This link doesn&rsquo;t work.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href="/" />}>
              go to ancestree
            </Button>
          </CardContent>
        </Card>
      </CenteredPage>
    );
  }

  const on = settings.subscribed;
  return (
    <CenteredPage>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Message Emails</CardTitle>
          <CardDescription>
            {on
              ? "An email when a relative writes to you before you visit."
              : "You're unsubscribed."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setMessageEmailsFromLink.bind(null, token, !on)}>
            <SubmitButton variant={on ? "default" : "outline"} pendingLabel="saving…">
              {on ? "unsubscribe" : "subscribe again"}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
