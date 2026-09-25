import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { switchTreeForm } from "@/app/actions/current-tree";
import { AcceptInviteForm, SignInToAccept } from "@/components/accept-invite-form";
import { AccountTypeGlyph } from "@/components/account-type-badge";
import { JoinTreeButton } from "@/components/join-tree-button";
import { MagicLinkForm } from "@/components/magic-link-form";
import { SubmitButton } from "@/components/submit-button";
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
import { sentToAnotherAddress } from "@/lib/invite-address";
import { inviteHref } from "@/lib/sign-in-links";
import {
  getInviteRecipient,
  inviteTreeId,
  opensOnSignInLink,
} from "@/lib/sign-in.server";
import { createClient } from "@/lib/supabase/server";
import { listMyTrees } from "@/lib/tree-context";
import { treeHref, treesHref } from "@/lib/tree-links";

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
  // email. A bare link has no address on it, so it still asks for one. Only
  // that address may accept it (Step 51), so a member's page looks it up too.
  const recipient = preview?.valid ? await getInviteRecipient(token) : null;
  const user = recipient ? await getUser() : null;
  const signedInAs = user ? verifiedEmail(user) : null;
  // Signed in as that address already, but no member yet: signing in sent
  // them here, to the invite waiting for them (Step 30.8).
  const signedInAsRecipient = Boolean(
    recipient && !sentToAnotherAddress(recipient.email, signedInAs),
  );
  // A member at another address (Step 51): a forwarded email, a shared
  // device, a Root checking one they sent. The database would refuse them,
  // so the page says whose it is instead of offering to join.
  const forAnotherAddress = Boolean(profile && recipient && !signedInAsRecipient);
  // Signed out, to an address that has an account already: open on its
  // sign-in link, with no tick to spend first (Step 41.2).
  const signInFirst = await opensOnSignInLink(recipient, {
    signedIn: Boolean(user),
  });
  const founds = preview?.founds_tree === true;
  // A member already on the tree it joins (Step 52): a family link goes
  // round a group chat, most of whom may be. There's nothing for them to
  // accept, so the page says so instead of "You'll join as a Leaf". A claim
  // invite still has an entry to hand over, and a founder invite a tree.
  const onTreeId =
    profile && preview?.valid && !founds && !preview.claim_person_name && !forAnotherAddress
      ? await inviteTreeId(token)
      : null;
  const alreadyOn = onTreeId
    ? (await listMyTrees()).some((t) => t.id === onTreeId)
    : false;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        {preview?.valid && recipient && forAnotherAddress ? (
          <ForAnotherAddress
            token={token}
            inviterName={preview.inviter_name}
            treeName={preview.tree_name}
            claimName={preview.claim_person_name}
            founds={founds}
            sentTo={recipient.email}
            signedInAs={signedInAs ?? user?.email ?? ""}
          />
        ) : preview?.valid && alreadyOn && onTreeId ? (
          <AlreadyOnTree treeId={onTreeId} treeName={preview.tree_name} />
        ) : preview?.valid ? (
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
                    : signInFirst
                      ? "Signing in adds it to your trees."
                      : recipient
                        ? "Accepting signs you in — there is nothing else to set up."
                        : "Enter your name and email, and we’ll email you a code to join."}
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
              ) : recipient && signInFirst ? (
                <SignInToAccept inviteToken={token} email={recipient.email} />
              ) : recipient ? (
                <AcceptInviteForm
                  inviteToken={token}
                  email={recipient.email}
                  consentGiven={recipient.requested}
                />
              ) : (
                <MagicLinkForm inviteToken={token} submitLabel="Accept &amp; sign in" />
              )}
              {!profile && recipient?.requested ? (
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

/**
 * An invite opened by a member already on the tree it joins (Step 52): no
 * joining, just the way in. Opening switches to the tree without touching
 * the invite, so a family link keeps its place for someone new.
 */
function AlreadyOnTree({ treeId, treeName }: { treeId: string; treeName: string }) {
  return (
    <>
      <CardHeader>
        <CardTitle>You&rsquo;re already on {treeName}</CardTitle>
        <CardDescription>This link is for relatives who aren&rsquo;t on it yet.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={switchTreeForm.bind(null, treeId, treeHref())}>
          <SubmitButton className="w-full" pendingLabel="Opening…">
            Open {treeName}
          </SubmitButton>
        </form>
      </CardContent>
    </>
  );
}

/**
 * An invite emailed to someone else, opened by a member signed in at
 * another address (Step 51): who it went to, and Sign out, which comes back
 * here signed out, where the usual path for that address takes over.
 */
function ForAnotherAddress({
  token,
  inviterName,
  treeName,
  claimName,
  founds,
  sentTo,
  signedInAs,
}: {
  token: string;
  inviterName: string;
  treeName: string;
  claimName: string | null;
  founds: boolean;
  sentTo: string;
  signedInAs: string;
}) {
  const address = (email: string) => (
    <span className="font-medium break-words text-foreground">{email}</span>
  );
  return (
    <>
      <CardHeader>
        <CardTitle>You&rsquo;re invited</CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{inviterName}</span>{" "}
          invited {address(sentTo)} to{" "}
          {founds ? (
            <>start a family tree of their own</>
          ) : claimName ? (
            <>
              join <span className="font-medium text-foreground">{treeName}</span>{" "}
              and claim the entry for{" "}
              <span className="font-medium text-foreground">{claimName}</span>
            </>
          ) : (
            <>
              help build <span className="font-medium text-foreground">{treeName}</span>
            </>
          )}
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          You&rsquo;re signed in as {address(signedInAs)}. Only {address(sentTo)}{" "}
          can accept it.
        </p>
        <form action={signOut}>
          <input type="hidden" name="next" value={inviteHref(token)} />
          <SubmitButton className="w-full" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
        <p className="text-xs text-muted-foreground">
          <Link href={treesHref()} className="underline underline-offset-4">
            Your trees
          </Link>
        </p>
      </CardContent>
    </>
  );
}
