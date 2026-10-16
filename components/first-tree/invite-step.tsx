"use client";

import Link from "next/link";

import {
  ACCOUNT_TYPE_TONE,
  AccountTypeGlyph,
} from "@/components/account-type-badge";
import { AccountTypeGuide } from "@/components/account-type-guide";
import { AdminClaimInvites } from "@/components/admin/admin-claim-invites";
import { AdminFamilyLink } from "@/components/admin/admin-family-link";
import { DirectInviteForm } from "@/components/direct-invite-form";
import { LinkPendingLabel } from "@/components/link-pending";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ACCOUNT_TYPES,
  BRANCHES_PER_ROOT,
  ROOT,
  ROOTS_PER_TREE,
  inWords,
  type AccountTypeKey,
} from "@/lib/account-types";
import { INVITE_FAMILY_ID, type TreeInvite } from "@/lib/first-tree";
import type { InviteStepData } from "@/lib/first-tree.server";
import type { Invitable } from "@/lib/invitable.server";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";

/**
 * How each account type comes to someone, beside what it is: the founder
 * is the Root, an invite makes someone a Leaf, and a Branch (or another Root)
 * is given to someone who has already joined — within the limits (Step 39).
 */
const HOW_THEY_GET_IT: Record<AccountTypeKey, string> = {
  admin: `That’s you. You can make ${inWords(ROOTS_PER_TREE - 1)} more ${plural(ROOTS_PER_TREE - 1, "Root")} once they’ve joined.`,
  branch_admin: `For whoever knows one side best. You can make up to ${inWords(BRANCHES_PER_ROOT)} Branches once they’ve joined.`,
  member: "Everyone invited joins as a Leaf.",
};

/**
 * The founder's invite step (Step 29): first the people they added on the
 * family step, each to invite by email or a link to send any other way
 * (Step 162, as settings lists them), with the family link above them for
 * a Root; then anyone else, by name and address, each joining as a Leaf
 * (Step 34), with who can do what on a tree beside it. Skippable — the
 * canvas's "Getting started" list keeps it.
 */
export function InviteStep({
  treeId,
  treeName,
  invites,
  invited,
  added,
  familyLink,
  baseUrl,
  nextHref,
}: {
  treeId: string;
  treeName: string;
  /** Out from this tree by email and not yet taken up. */
  invites: TreeInvite[];
  /** Anyone invited, by email or a link, or joined. */
  invited: boolean;
  /** The living people they added here that nobody is behind yet. */
  added: Invitable[];
  /** A Root's family link, made or not. */
  familyLink: InviteStepData["familyLink"];
  baseUrl: string;
  nextHref: string;
}) {
  // Someone they added who's been invited shows it in the list above.
  const listed = new Set(added.map((p) => p.id));
  const others = invites.filter((i) => !i.personId || !listed.has(i.personId));

  return (
    // The forms first, and what each account type can do beside them on a
    // wide screen, below them on a narrow one (Step 124).
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex flex-col gap-6">
        {familyLink ? (
          <Card>
            <CardHeader>
              <CardTitle>Family Link</CardTitle>
              <CardDescription>One link for the family group chat.</CardDescription>
            </CardHeader>
            <CardContent>
              <AdminFamilyLink
                treeId={treeId}
                treeName={treeName}
                link={familyLink.link}
                joins={familyLink.joins}
                baseUrl={baseUrl}
                hideNoJoins
              />
            </CardContent>
          </Card>
        ) : null}

        {added.length > 0 ? (
          <Card id={INVITE_FAMILY_ID} className="scroll-mt-24">
            <CardHeader>
              <CardTitle>Your Family</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminClaimInvites treeId={treeId} treeName={treeName} people={added} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{added.length > 0 ? "Someone Else" : "Invite Relatives"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {others.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Invited so far</p>
                <ul className="flex flex-col gap-1.5">
                  {others.map((invite) => (
                    <li
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{invite.name}</span>{" "}
                        <span className="text-muted-foreground">{invite.email}</span>
                        {invite.claims ? (
                          <span className="block text-xs text-muted-foreground">
                            To take over the entry for {invite.claims}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {invite.emailSent === false ? "Email didn’t send" : "Emailed"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <DirectInviteForm treeId={treeId} />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            nativeButton={false}
            render={<Link href={nextHref} />}
            variant={invited ? "default" : "outline"}
          >
            <LinkPendingLabel>{invited ? "continue" : "skip for now"}</LinkPendingLabel>
          </Button>
          <p className="text-xs text-muted-foreground">
            You can invite people later too.
          </p>
        </div>
      </div>

      <aside aria-label="Who can do what">
        <Card size="sm" className="bg-muted/30">
          <CardHeader>
            <CardTitle>Who Can Do What</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-3">
              {ACCOUNT_TYPES.map((type) => (
                <li key={type.key} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md border",
                      ACCOUNT_TYPE_TONE[type.key],
                    )}
                  >
                    <AccountTypeGlyph type={type} className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium text-foreground">{type.name}</span>
                      <span className="text-muted-foreground">{type.tagline}</span>
                      {type.key === ROOT.key ? (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">{HOW_THEY_GET_IT[type.key]}</p>
                  </div>
                </li>
              ))}
            </ul>
            <details className="group rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground marker:text-muted-foreground">
                Everything each type can do
              </summary>
              <div className="border-t border-border p-3">
                <AccountTypeGuide currentRole={ROOT.key} className="sm:grid-cols-1" />
              </div>
            </details>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
