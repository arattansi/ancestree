import type { Metadata } from "next";
import Link from "next/link";

import { setGettingStartedFromLink } from "@/app/actions/getting-started";
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
import { readGettingStartedByToken } from "@/lib/onboarding-settings.server";
import { gettingStartedSettingsHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "getting started emails",
  robots: { index: false },
};

/**
 * The getting started emails' link (Step 151), signed out: says whether
 * they're on and turns them off, or back on, as the newsletter's page
 * does. Opening it changes nothing; the button does, so a mail scanner
 * following the link can't.
 */
export default async function GettingStartedPage({
  params,
}: PageProps<"/getting-started/[token]">) {
  const { token } = await params;
  const settings = await readGettingStartedByToken(token);

  if (!settings) {
    return (
      <CenteredPage>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link Not Found</CardTitle>
            <CardDescription>This link doesn&rsquo;t work.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href={gettingStartedSettingsHref()} />}>
              change it in settings
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
          <CardTitle>Getting Started Emails</CardTitle>
          <CardDescription>
            {on ? "Tips now and then for your first weeks." : "You're unsubscribed."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setGettingStartedFromLink.bind(null, token, !on)}>
            <SubmitButton
              variant={on ? "default" : "outline"}
              pendingLabel="saving…"
            >
              {on ? "unsubscribe" : "subscribe again"}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
