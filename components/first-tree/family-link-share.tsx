"use client";

import Link from "next/link";

import { rotateFamilyLink } from "@/app/actions/family-link";
import { PendingButton } from "@/components/pending-button";
import { ShareMessage } from "@/components/share-message";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAction } from "@/components/use-action";
import {
  FAMILY_LINK_MAX_USES,
  familyLinkCount,
  familyLinkMessage,
  isFamilyLinkFull,
} from "@/lib/family-link";
import type { FamilyLink } from "@/lib/family-link.server";
import { inviteHref } from "@/lib/sign-in-links";
import { adminHref } from "@/lib/tree-links";

/**
 * The founder's invite step opens on this (Step 212): the tree's family
 * link, made for them as the step loaded, and a message with it ready for
 * the family chat, to share, send by WhatsApp or Messages, or copy
 * (`ShareMessage`). A full link offers a new one; the Root console keeps
 * the rest (cap, rotate, turn off).
 */
export function FamilyLinkShare({
  treeId,
  treeName,
  link,
  baseUrl,
  onShared,
}: {
  treeId: string;
  treeName: string;
  link: FamilyLink;
  baseUrl: string;
  /** It went somewhere, as far as the page can tell. */
  onShared: () => void;
}) {
  const action = useAction();
  const message = familyLinkMessage(`${baseUrl}${inviteHref(link.token)}`, treeName);
  const full = isFamilyLinkFull(link);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Family Link</CardTitle>
        <CardDescription>
          One link for your family chat. Anyone with it can join, up to{" "}
          {link.maxUses}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {full ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              It&rsquo;s full: {familyLinkCount(link)}.
            </p>
            <PendingButton
              type="button"
              size="sm"
              pending={action.pendingKey === "rotate"}
              pendingLabel="making…"
              disabled={action.pending}
              onClick={() =>
                action.run("rotate", () => rotateFamilyLink(treeId, FAMILY_LINK_MAX_USES))
              }
            >
              new link
            </PendingButton>
          </div>
        ) : (
          <ShareMessage message={message} onShared={onShared} />
        )}
        <p className="text-xs text-muted-foreground">
          {link.useCount > 0 && !full ? `${familyLinkCount(link)} · ` : null}
          <Link href={adminHref("family-link")} className="underline underline-offset-4">
            Manage link
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
