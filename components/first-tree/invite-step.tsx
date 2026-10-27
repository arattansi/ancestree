"use client";

import * as React from "react";
import Link from "next/link";

import { AdminClaimInvites } from "@/components/admin/admin-claim-invites";
import { AdminFamilyLink } from "@/components/admin/admin-family-link";
import { DirectInviteForm } from "@/components/direct-invite-form";
import { FamilyLinkShare } from "@/components/first-tree/family-link-share";
import { LinkPendingLabel } from "@/components/link-pending";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WhoCanDoWhat } from "@/components/who-can-do-what";
import { ROOT } from "@/lib/account-types";
import { INVITE_FAMILY_ID, type TreeInvite } from "@/lib/first-tree";
import type { InviteStepData } from "@/lib/first-tree.server";
import type { Invitable } from "@/lib/invitable.server";

/**
 * The founder's invite step (Step 29): first the tree's family link, made
 * for them and ready to share with a message (Step 212); then the people
 * they added on the family step, each to invite by email or a link to send
 * any other way (Step 162, as settings lists them); then anyone else, by
 * name and address, each joining as a Leaf (Step 34). Over them, one line on what an invite lets someone do, and who
 * can do what on demand (Step 171): the side panel that said it all before
 * anyone had joined is gone, and each Root hears when someone joins, with
 * the offer of a Branch then. Skippable — the canvas's "Getting started"
 * list keeps it.
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
  /** A Root's family link, made as the step loaded (Step 212). */
  familyLink: InviteStepData["familyLink"];
  baseUrl: string;
  nextHref: string;
}) {
  // Someone they added who's been invited shows it in the list above.
  const listed = new Set(added.map((p) => p.id));
  // Shared this visit: an unused family link isn't an invite (Step 212),
  // so the page goes by the press.
  const [shared, setShared] = React.useState(false);
  const onward = invited || shared;
  const onShared = React.useCallback(() => setShared(true), []);
  const others = invites.filter((i) => !i.personId || !listed.has(i.personId));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Everyone you invite can add their own side of the family.{" "}
        <WhoCanDoWhat currentRole={ROOT.key} />
      </p>

      <div id={INVITE_FAMILY_ID} className="flex scroll-mt-24 flex-col gap-6">
        {familyLink?.link ? (
          <FamilyLinkShare
            treeId={treeId}
            treeName={treeName}
            link={familyLink.link}
            baseUrl={baseUrl}
            onShared={onShared}
          />
        ) : familyLink ? (
          // Making it as the step loaded didn't take: make it here.
          <Card>
            <CardHeader>
              <CardTitle>Family Link</CardTitle>
              <CardDescription>One link for your family chat.</CardDescription>
            </CardHeader>
            <CardContent>
              <AdminFamilyLink
                treeId={treeId}
                treeName={treeName}
                link={null}
                joins={familyLink.joins}
                baseUrl={baseUrl}
                hideNoJoins
              />
            </CardContent>
          </Card>
        ) : null}

        {added.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Your Family</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminClaimInvites treeId={treeId} treeName={treeName} people={added} />
            </CardContent>
          </Card>
        ) : null}
      </div>

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
          variant={onward ? "default" : "outline"}
        >
          <LinkPendingLabel>{onward ? "continue" : "skip for now"}</LinkPendingLabel>
        </Button>
        <p className="text-xs text-muted-foreground">
          You can invite people later too.
        </p>
      </div>
    </div>
  );
}
