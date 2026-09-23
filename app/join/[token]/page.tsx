import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInviteForm } from "@/components/accept-invite-form";
import { AccountTypeGlyph } from "@/components/account-type-badge";
import { JoinTreeButton } from "@/components/join-tree-button";
import { MagicLinkForm } from "@/components/magic-link-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LEAF, ROOT } from "@/lib/account-types";
import { getProfile, getUser } from "@/lib/auth";
import { verifiedEmail } from "@/lib/first-timer";
import { getInviteRecipient } from "@/lib/sign-in.server";
import { createClient } from "@/lib/supabase/server";
import { treesHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "accept invite",
  description: "Join your family tree on ancestree.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // A member already: the invite adds a tree, not an account (Step 25).
  const profile = await getProfile();

  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { p_token: token });
  const preview = data?.[0];

  // An invite emailed to someone is their sign-in link: one button, no second
  // email. A bare link has no address on it, so it still asks for one.
  const recipient =
    preview?.valid && !profile ? await getInviteRecipient(token) : null;
  // Signed in as that address already, but no member yet: signing in sent
  // them here, to the invite waiting for them (Step 30.8).
  const user = recipient ? await getUser() : null;
  const signedInAsRecipient = Boolean(
    user && recipient && verifiedEmail(user) === recipient.email,
  );
  const founds = preview?.founds_tree === true;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        {preview?.valid ? (
          <>
            <CardHeader>
              <CardTitle>You&rsquo;re invited</CardTitle>
              <CardDescription>
                <span className="font-medium text-foreground">
                  {preview.inviter_name}
                </span>{" "}
                invited you to{" "}
                {founds ? (
                  <>start a family tree of your own</>
                ) : preview.claim_person_name ? (
                  <>
                    join{" "}
                    <span className="font-medium text-foreground">
                      {preview.tree_name}
                    </span>{" "}
                    and claim the entry for{" "}
                    <span className="font-medium text-foreground">
                      {preview.claim_person_name}
                    </span>
                  </>
                ) : (
                  <>
                    help build{" "}
                    <span className="font-medium text-foreground">
                      {preview.tree_name}
                    </span>
                  </>
                )}
                .{" "}
                {profile
                  ? "You’re signed in, so accepting adds it to your trees."
                  : signedInAsRecipient
                    ? "You’re signed in with the address it was sent to — there is nothing else to set up."
                    : recipient
                      ? "Accepting signs you in — there is nothing else to set up."
                      : "Enter your name and email to get a sign-in link — opening it accepts the invite."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {founds ? (
                <div className="mb-5 flex items-start gap-3 rounded-lg border border-account-root/30 bg-account-root/10 p-3 text-sm">
                  <AccountTypeGlyph type={ROOT} tinted className="mt-0.5" />
                  <p className="text-foreground">
                    You&rsquo;ll be the tree&rsquo;s first{" "}
                    <span className="font-medium">Root</span>: it starts empty,
                    and you decide who joins it and what they can do. You can
                    rename it any time.
                  </p>
                </div>
              ) : (
                // Say what a Leaf is before they sign up, not after. Every
                // invite into a tree makes one (Step 34).
                <div className="mb-5 flex items-start gap-3 rounded-lg border border-account-leaf/30 bg-account-leaf/10 p-3 text-sm">
                  <AccountTypeGlyph type={LEAF} tinted className="mt-0.5" />
                  <p className="text-foreground">
                    You&rsquo;ll join as a{" "}
                    <span className="font-medium">Leaf</span>: you can see the
                    whole tree, add relatives on your own line — your parents
                    and grandparents, everyone descended from them, and the
                    people they married — keep your own entry up to date, and
                    comment on or flag anything that looks wrong.
                  </p>
                </div>
              )}
              {profile ? (
                <JoinTreeButton
                  token={token}
                  label={founds ? "Start my tree" : `Join ${preview.tree_name}`}
                />
              ) : recipient ? (
                <AcceptInviteForm
                  inviteToken={token}
                  email={recipient.email}
                  consentGiven={recipient.requested}
                />
              ) : (
                <MagicLinkForm inviteToken={token} submitLabel="Accept &amp; sign in" />
              )}
              {recipient?.requested ? (
                // They ticked the privacy notice when they asked to join, or
                // to start a tree from the waitlist (Step 30.6).
                <p className="mt-4 text-xs text-muted-foreground">
                  By joining you agree to share your family details with other
                  members of this private tree.
                </p>
              ) : null}
              {profile ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  <Link href={treesHref()} className="underline underline-offset-4">
                    Your trees
                  </Link>
                </p>
              ) : null}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Invite not available</CardTitle>
              <CardDescription>
                This invite link is invalid, has already been used, or has
                expired. Ask the relative who invited you for a fresh link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <Link href="/" className="underline underline-offset-4">
                  Back home
                </Link>
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
