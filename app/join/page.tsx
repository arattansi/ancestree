import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import { MagicLinkForm } from "@/components/magic-link-form";
import { RequestAccessFlow } from "@/components/request-access";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProfile, getUser } from "@/lib/auth";
import { verifiedEmail, type FirstTimerStep } from "@/lib/first-timer";
import { loadFirstTimerStep } from "@/lib/first-timer.server";
import { DEFAULT_NEXT, sameOriginPath } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "join",
  description: "ancestree is invite-only. Sign in with a family invite link.",
};

export default async function JoinPage({
  searchParams,
}: PageProps<"/join">) {
  const { error, next: nextParam } = await searchParams;
  // Where they were going when proxy.ts sent them here — an alert email's
  // button, say — so signing in takes them back to it (Step 30.1).
  const next = sameOriginPath(typeof nextParam === "string" ? nextParam : null);

  const profile = await getProfile();
  if (profile) redirect(next ?? DEFAULT_NEXT);

  // Signed in, but not a member yet (Step 30.8): what's waiting for the
  // address they've verified. An invite emailed to it opens on its own page.
  const user = await getUser();
  const email = user ? verifiedEmail(user) : null;
  const step = email ? await loadFirstTimerStep(email) : null;
  if (step?.kind === "invite") redirect(step.href);

  const alert =
    error === "invite" ? (
      <p
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
      >
        That invite link is invalid, already used, or expired.
      </p>
    ) : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        {user ? (
          <NotYetMember email={email} step={step} alert={alert} />
        ) : (
          <>
            <CardHeader>
              <CardTitle>Sign In to ancestree</CardTitle>
              <CardDescription>
                ancestree is a private family tree. Enter your email and
                we&rsquo;ll send you a sign-in code.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {alert}
              <MagicLinkForm next={next ?? undefined} />
              {/* Signing in without an invite goes round the whole email loop
                  only to land on "Almost There", so say it's invite-only
                  before they send one (Step 30.4), as the home page does. */}
              <p className="text-sm text-muted-foreground">
                New here? ancestree is invite-only:{" "}
                <Link
                  href="/request-invite"
                  className="whitespace-nowrap underline underline-offset-4"
                >
                  request access
                </Link>
                , or open the invite a relative emailed you.
              </p>
              <BackHome />
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}

/**
 * Signed in, not a member, and no invite waiting for their address (Step
 * 30.8): where their request to join stands, or request access right here
 * with that address filled in, so they type only their name. Always a way
 * to sign out, for someone who verified the wrong address.
 */
function NotYetMember({
  email,
  step,
  alert,
}: {
  email: string | null;
  step: FirstTimerStep | null;
  alert: React.ReactNode;
}) {
  const requested = step?.kind === "requested" ? step : null;
  const ask = step?.kind === "ask" && email ? step : null;

  return (
    <>
      <CardHeader>
        <CardTitle>{requested ? "Waiting for an Invite" : "Almost There"}</CardTitle>
        <CardDescription>
          {requested
            ? "Your email is verified. Here’s where your request to join stands."
            : "Your email is verified, but no family invite is waiting for it. Tell us your name and we’ll look for your family’s tree, or open the invite link a relative sent you."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {alert}
        {requested ? (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted/40 p-4 text-sm"
          >
            <p className="font-medium text-foreground">
              You asked to join {requested.treeName}
            </p>
            <p className="mt-1 text-muted-foreground">
              Its Roots have been told. Once one of them approves, we&rsquo;ll
              email <span className="font-medium break-words text-foreground">{email}</span>{" "}
              a link that takes you straight into the tree — nothing more to
              sign up for.
            </p>
          </div>
        ) : null}
        {ask ? (
          <>
            {ask.waitlisted ? (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                You&rsquo;re on the waitlist to start a tree of your own, and
                we&rsquo;ll email you when you can. If your family already has
                one, you can ask to join it too.
              </p>
            ) : null}
            <RequestAccessFlow email={email ?? undefined} />
          </>
        ) : null}
        <form action={signOut} className="text-sm text-muted-foreground">
          <input type="hidden" name="next" value="/join" />
          {email ? (
            <>
              Signed in as{" "}
              <span className="font-medium break-words text-foreground">{email}</span>
              .{" "}
            </>
          ) : null}
          <SubmitButton
            variant="link"
            className="h-auto p-0 align-baseline text-sm font-normal text-inherit underline"
          >
            Use another email
          </SubmitButton>
        </form>
        <BackHome />
      </CardContent>
    </>
  );
}

function BackHome() {
  return (
    <p className="text-sm text-muted-foreground">
      <Link href="/" className="underline underline-offset-4">
        Back home
      </Link>
    </p>
  );
}
