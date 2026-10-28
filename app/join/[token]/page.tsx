import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { AcceptInviteForm, SignInToAccept } from "@/components/accept-invite-form";
import { AccountTypeGlyph } from "@/components/account-type-badge";
import { JoinTreeButton } from "@/components/join-tree-button";
import { MagicLinkSignIn } from "@/components/magic-link-sign-in";
import { CenteredPage } from "@/components/page-column";
import { RenewInvite } from "@/components/renew-invite";
import { SubmitButton } from "@/components/submit-button";
import { TreeGlimpse } from "@/components/tree-glimpse";
import { TreeTarget } from "@/components/tree-target";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LEAF, ROOT } from "@/lib/account-types";
import { getProfile, getSessionUser, getUser } from "@/lib/auth";
import { verifiedEmail } from "@/lib/first-timer";
import { firstName, glimpseCount, UNNAMED_INVITER } from "@/lib/invite-glimpse";
import { readInviteGlimpse } from "@/lib/invite-glimpse.server";
import { sentToAnotherAddress } from "@/lib/invite-address";
import { lapsedState, relativesOnTree } from "@/lib/lapsed-invites";
import { isNoEmailAddress } from "@/lib/no-email";
import { readSentCodeFor } from "@/lib/sent-code.server";
import { inviteHref } from "@/lib/sign-in-links";
import { opensOnSignInLink, readInvite } from "@/lib/sign-in.server";
import { createClient } from "@/lib/supabase/server";
import {
  currentAccess,
  isTreeChosen,
  listMyTrees,
} from "@/lib/tree-context";
import { treeHref, treesHref } from "@/lib/tree-links";
import { treeForInvitee, treeInSentence } from "@/lib/tree-names";

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
  const supabase = await createClient();

  // Everything that needs only the token or the session, at once (Step
  // 77.1). A member already: the invite adds a tree, not an account (Step
  // 25). The invite itself is read by its token, which is its secret, so
  // reading it before the preview has said it's live reveals nothing. An
  // expired one emailed to someone has its own preview (Step 163). What
  // it shows of the tree comes with the rest (Step 215).
  const [profile, sessionUser, { data }, { data: lapsedData }, invite, myTrees, access, chosen, glimpse] =
    await Promise.all([
      getProfile(),
      getSessionUser(),
      supabase.rpc("invite_preview", { p_token: token }),
      supabase.rpc("lapsed_invite_preview", { p_token: token }),
      readInvite(token),
      listMyTrees(),
      currentAccess(),
      isTreeChosen(),
      readInviteGlimpse(token),
    ]);
  // Only the tree picked this visit opens with a plain link: a bare /tree
  // with nothing picked opens My Family Tree.
  const currentTreeId =
    access?.kind === "member" && chosen ? access.membership.tree.id : null;
  const preview = data?.[0];
  const lapsed = preview ? null : lapsedData?.[0];
  // How many are on it already, never who (Step 163): the page is open to
  // whoever has the link. A live one shows the tree as unnamed leaves under
  // the count, and a claim link says what its entry is to the inviter
  // (Step 215, Aalim's calls): nothing in `glimpse` names anyone.
  const relatives = relativesOnTree(preview?.members ?? lapsed?.members);
  const inviterFirst =
    preview && preview.inviter_name !== UNNAMED_INVITER ? firstName(preview.inviter_name) : null;
  const treeLabel = preview
    ? treeForInvitee(preview.tree_name, { firstName: inviterFirst, ...glimpse?.inviterFamily })
    : "";
  const treeCount =
    preview && glimpse
      ? glimpseCount({ people: glimpse.people, members: preview.members })
      : relatives;
  // A tree with nobody on it but the inviter has no picture: its count is
  // said with the rest.
  const pictured = glimpse && glimpse.people > 1 ? glimpse : null;

  // An invite emailed to someone is their sign-in link: one button, no second
  // email. A bare link has no address on it: a family link or claim link
  // joins with a name (Step 213), any other still asks for one. Only
  // that address may accept it (Step 51), so a member's page looks it up too.
  // Signed out, to an address that has an account already: open on its
  // sign-in link, with no tick to spend first (Step 41.2); with no session
  // at all, that's asked beside the rest, as is a code this invite emailed
  // that address within the hour, which opens on its box again (Step 165).
  const recipient = preview?.valid ? invite.recipient : null;
  const [user, signedOutOpensOnLink, sentCode] = await Promise.all([
    recipient && sessionUser ? getUser() : null,
    sessionUser ? null : opensOnSignInLink(recipient, { signedIn: false }),
    recipient && !sessionUser
      ? readSentCodeFor({ inviteToken: token, email: recipient.email })
      : null,
  ]);
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
  // A code went out, so the address has an account (Step 165).
  const signInFirst =
    Boolean(sentCode) ||
    (signedOutOpensOnLink ??
      (await opensOnSignInLink(recipient, { signedIn: Boolean(user) })));
  const founds = preview?.founds_tree === true;
  // A member already on the tree it joins (Step 52): a family link goes
  // round a group chat, most of whom may be. There's nothing for them to
  // accept, so the page says so instead of what joining lets them do. A claim
  // invite still has an entry to hand over, and a founder invite a tree.
  const onTreeId =
    profile && preview?.valid && !founds && !preview.claim_person_name && !forAnotherAddress
      ? invite.treeId
      : null;
  const alreadyOn = onTreeId
    ? myTrees.some((t) => t.id === onTreeId)
    : false;

  return (
    <CenteredPage>
      <Card className="w-full max-w-md">
        {preview?.valid && recipient && forAnotherAddress ? (
          <ForAnotherAddress
            token={token}
            inviterName={preview.inviter_name}
            treeName={treeLabel}
            claimName={preview.claim_person_name}
            founds={founds}
            sentTo={recipient.email}
            signedInAs={
              signedInAs ??
              (isNoEmailAddress(user?.email) ? profile?.display_name : user?.email) ??
              ""
            }
          />
        ) : preview?.valid && alreadyOn && onTreeId ? (
          <AlreadyOnTree
            treeId={onTreeId}
            treeName={treeLabel}
            currentTreeId={currentTreeId}
          />
        ) : preview?.valid ? (
          <>
            <CardHeader>
              <CardTitle>You&rsquo;re invited</CardTitle>
              {glimpse?.inviterPhoto && !founds ? (
                // Their own photo: they sent the link (Step 215), and it's
                // left out if they hide their entry from visitors.
                <CardAction className="size-11 overflow-hidden rounded-full border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
                  <img
                    src={glimpse.inviterPhoto.url}
                    alt={`Photo of ${preview.inviter_name}`}
                    style={glimpse.inviterPhoto.style}
                    className="size-full object-cover"
                  />
                </CardAction>
              ) : null}
              <CardDescription>
                <span className="font-medium text-foreground">
                  {preview.inviter_name}
                </span>{" "}
                {founds ? (
                  <>invited you to start a family tree of your own</>
                ) : preview.claim_person_name && glimpse?.relation ? (
                  // "Chidi Okafor added you to The Okafor Family as his
                  // wife, Ada Okafor" (Step 215).
                  <>
                    added you to{" "}
                    <span className="font-medium text-foreground">{treeLabel}</span>{" "}
                    as {glimpse.relation},{" "}
                    <span className="font-medium text-foreground">
                      {preview.claim_person_name}
                    </span>
                  </>
                ) : preview.claim_person_name ? (
                  <>
                    invited you to join{" "}
                    <span className="font-medium text-foreground">{treeLabel}</span>{" "}
                    and claim the entry for{" "}
                    <span className="font-medium text-foreground">
                      {preview.claim_person_name}
                    </span>
                  </>
                ) : (
                  <>
                    invited you to help build{" "}
                    <span className="font-medium text-foreground">{treeLabel}</span>
                  </>
                )}
                .{" "}
                {!founds && !pictured && treeCount ? `${treeCount} ` : null}
                {profile
                  ? "You’re signed in, so accepting adds it to your trees."
                  : signedInAsRecipient
                    ? "You’re signed in with the address it was sent to — there is nothing else to set up."
                    : signInFirst
                      ? "Signing in adds it to your trees."
                      : recipient
                        ? "Accepting signs you in — there is nothing else to set up."
                        : invite.openToNoEmail
                          ? "Enter your name to join."
                          : "Enter your name and email, and we’ll email you a code to join."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pictured && !founds && treeCount ? (
                <TreeGlimpse
                  rows={pictured.rows}
                  inviterName={inviterFirst ?? "Who invited you"}
                  caption={treeCount}
                  className="mb-4"
                />
              ) : null}
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
                // What joining lets them do, in one sentence, and the rest
                // on demand (Step 171): every invite into a tree makes a
                // Leaf (Step 34), but the name can wait until it matters.
                <div className="mb-5 flex items-start gap-3 rounded-lg border border-account-leaf/30 bg-account-leaf/10 p-3 text-sm">
                  <AccountTypeGlyph type={LEAF} tinted className="mt-0.5" />
                  <div className="flex min-w-0 flex-col gap-1.5 text-foreground">
                    <p>You can add your own side of the family.</p>
                    <details>
                      <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
                        What can I do?
                      </summary>
                      <p className="mt-1.5 text-muted-foreground">
                        See the whole tree, add relatives on your own line —
                        your parents and grandparents, everyone descended from
                        them, and the people they married — keep your own entry
                        up to date, add stories and photos, and report anything
                        that looks wrong. You join as a Leaf; a Root can make
                        you a Branch, to look after your side.
                      </p>
                    </details>
                  </div>
                </div>
              )}
              {profile ? (
                <JoinTreeButton
                  token={token}
                  label={founds ? "start my tree" : `join ${treeLabel}`}
                />
              ) : recipient && signInFirst ? (
                <SignInToAccept
                  inviteToken={token}
                  email={recipient.email}
                  sent={sentCode ?? undefined}
                />
              ) : recipient ? (
                <AcceptInviteForm
                  inviteToken={token}
                  email={recipient.email}
                  consentGiven={recipient.requested}
                  founds={founds}
                />
              ) : (
                // A family link or claim link joins with a name, and asks
                // for an email once they're in (Step 213): opened from a
                // group chat on a phone, there's no inbox to go to first.
                <MagicLinkSignIn
                  inviteToken={token}
                  submitLabel="accept &amp; sign in"
                  noEmail={invite.openToNoEmail}
                  joinLabel={`join ${treeLabel}`}
                />
              )}
              {!profile && recipient?.requested ? (
                // They ticked the privacy notice when they asked to join, or
                // to start a tree from the waitlist (Step 30.6). A founder's
                // tree starts empty (Step 165).
                <p className="mt-4 text-xs text-muted-foreground">
                  {founds
                    ? "By starting your tree you agree to share your family details with the family who join it."
                    : "By joining you agree to share your family details with other members of this private tree."}
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
        ) : lapsed ? (
          <LapsedInvite token={token} lapsed={lapsed} relatives={relatives} />
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
    </CenteredPage>
  );
}

/**
 * An expired invite that was emailed to someone (Step 163): who sent it and
 * where to, and a fresh link to the same address, masked here — anyone may
 * hold the link, but only that inbox gets the new one.
 */
function LapsedInvite({
  token,
  lapsed,
  relatives,
}: {
  token: string;
  lapsed: {
    inviter_name: string;
    tree_name: string;
    claim_person_name: string | null;
    masked_email: string;
    state: string;
  };
  relatives: string | null;
}) {
  const strong = (text: string) => (
    <span className="font-medium text-foreground">{text}</span>
  );
  const tree = treeInSentence(lapsed.tree_name);
  return (
    <>
      <CardHeader>
        <CardTitle>This link expired</CardTitle>
        <CardDescription>
          {strong(lapsed.inviter_name)}{" "}
          {lapsed.claim_person_name ? (
            <>
              added you to {strong(tree)}, with an entry for{" "}
              {strong(lapsed.claim_person_name)}
            </>
          ) : (
            <>invited you to {strong(tree)}</>
          )}
          .{relatives ? ` ${relatives}` : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RenewInvite
          token={token}
          state={lapsedState(lapsed.state)}
          maskedEmail={lapsed.masked_email}
          inviterName={lapsed.inviter_name}
          treeName={tree}
        />
      </CardContent>
    </>
  );
}

/**
 * An invite opened by a member already on the tree it joins (Step 52): no
 * joining, just the way in. Opening switches to the tree without touching
 * the invite, so a family link keeps its place for someone new.
 */
function AlreadyOnTree({
  treeId,
  treeName,
  currentTreeId,
}: {
  treeId: string;
  treeName: string;
  currentTreeId: string | null;
}) {
  return (
    <>
      <CardHeader>
        <CardTitle>You&rsquo;re already on {treeName}</CardTitle>
        <CardDescription>This link is for relatives who aren&rsquo;t on it yet.</CardDescription>
      </CardHeader>
      <CardContent>
        <TreeTarget
          treeId={treeId}
          currentTreeId={currentTreeId}
          href={treeHref()}
          className="w-full"
        >
          open {treeName}
        </TreeTarget>
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
          <SubmitButton className="w-full" pendingLabel="signing out…">
            sign out
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
