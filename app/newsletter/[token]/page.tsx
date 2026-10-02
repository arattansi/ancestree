import type { Metadata } from "next";
import Link from "next/link";

import { setNewsletterFromLink } from "@/app/actions/newsletter";
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
import { readNewsletterByToken } from "@/lib/newsletter-settings.server";
import { newsletterSettingsHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "weekly newsletter",
  robots: { index: false },
};

/**
 * The weekly newsletter's Unsubscribe link (Step 95), signed out: says
 * whether it's on and turns it off, or back on. Opening it changes
 * nothing; the button does, so a mail scanner following the link can't.
 */
export default async function NewsletterPage({
  params,
}: PageProps<"/newsletter/[token]">) {
  const { token } = await params;
  const settings = await readNewsletterByToken(token);

  if (!settings) {
    return (
      <CenteredPage>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link Not Found</CardTitle>
            <CardDescription>This link doesn&rsquo;t work.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href={newsletterSettingsHref()} />}>
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
          <CardTitle>Weekly Newsletter</CardTitle>
          <CardDescription>
            {on
              ? "You get it every Sunday."
              : "You're unsubscribed."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setNewsletterFromLink.bind(null, token, !on)}>
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
