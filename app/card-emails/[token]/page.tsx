import type { Metadata } from "next";
import Link from "next/link";

import { setCardEmailsFromLink } from "@/app/actions/card-emails";
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
import { readCardEmailsByToken } from "@/lib/card-last-calls.server";

export const metadata: Metadata = {
  title: "birthday card emails",
  robots: { index: false },
};

/**
 * The link in a "last chance to sign" email (Step 232), signed out: says
 * whether those emails are on and turns them off, or back on, as the
 * message emails' page does (Step 182). Opening it changes nothing; the
 * button does, so a mail scanner following the link can't.
 */
export default async function CardEmailsPage({
  params,
}: PageProps<"/card-emails/[token]">) {
  const { token } = await params;
  const settings = await readCardEmailsByToken(token);

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
          <CardTitle>Birthday Card Emails</CardTitle>
          <CardDescription>
            {on
              ? "An email when a birthday card you haven't signed opens in a week."
              : "You're unsubscribed."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setCardEmailsFromLink.bind(null, token, !on)}>
            <SubmitButton variant={on ? "default" : "outline"} pendingLabel="saving…">
              {on ? "unsubscribe" : "subscribe again"}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
