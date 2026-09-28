"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  rotateFamilyLink,
  setFamilyLinkCap,
  turnOffFamilyLink,
} from "@/app/actions/family-link";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { ConfirmButton } from "@/components/confirm-dialog";
import { PendingButton } from "@/components/pending-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import {
  FAMILY_LINK_CAPS,
  FAMILY_LINK_MAX_USES,
  familyLinkCount,
  isFamilyLinkFull,
  whatsappShareHref,
} from "@/lib/family-link";
import type { FamilyLink, FamilyLinkJoin } from "@/lib/family-link.server";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The tree's family link on /admin (Step 52): one open link for a family
 * group chat, capped, rotatable, and who joined through it.
 */
export function AdminFamilyLink({
  treeId,
  treeName,
  link,
  joins,
  baseUrl,
}: {
  treeId: string;
  treeName: string;
  link: FamilyLink | null;
  joins: FamilyLinkJoin[];
  baseUrl: string;
}) {
  // Before there's a link, the cap is only picked here, for Make to use.
  const [draftCap, setDraftCap] = React.useState(FAMILY_LINK_MAX_USES);
  // With one, a new cap shows as it's picked and saves at once, and goes
  // back by itself if the save doesn't take.
  const [cap, setCap] = React.useOptimistic(link ? link.maxUses : draftCap);
  // Making the link and changing its cap, one at a time. Rotate and Turn off
  // ask first, and wait for them.
  const action = useAction();
  // Making the link and turning it off each swap the buttons for others:
  // focus goes on to the one that takes their place.
  const returnFocus = useFocusReturn();
  const makeRef = React.useRef<HTMLButtonElement>(null);
  const copyRef = React.useRef<HTMLButtonElement>(null);

  const url = link ? `${baseUrl}/join/${link.token}` : null;
  const full = link ? isFamilyLinkFull(link) : false;

  async function copy(text: string, silent = false) {
    try {
      await navigator.clipboard.writeText(text);
      if (!silent) toast.success("Family link copied");
    } catch {
      if (!silent) toastError("Couldn't copy. Select the link and copy it.");
    }
  }

  function make() {
    action.run("make", () => rotateFamilyLink(treeId, cap), {
      onSuccess: () => {
        // Once turned off, the next link starts from the default again.
        setDraftCap(FAMILY_LINK_MAX_USES);
        returnFocus(() => copyRef.current);
      },
    });
  }

  function changeCap(next: number) {
    if (!link) {
      setDraftCap(next);
      return;
    }
    if (next === link.maxUses) return;
    action.run("cap", async () => {
      setCap(next);
      return setFamilyLinkCap(treeId, next);
    });
  }

  const capPicker = (
    <div className="flex items-center gap-2">
      <Label htmlFor="family-link-cap" className="text-sm font-normal text-muted-foreground">
        Up to
      </Label>
      <Select
        value={String(cap)}
        onValueChange={(v) => changeCap(Number(v ?? cap))}
        disabled={action.pending}
      >
        <SelectTrigger id="family-link-cap" size="sm" className="min-w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FAMILY_LINK_CAPS.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground">people</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {link && url ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {full ? (
              <Badge variant="destructive">Full</Badge>
            ) : (
              <Badge variant="secondary">Open</Badge>
            )}
            <span className="text-muted-foreground">
              {familyLinkCount(link)} · made by {link.createdByName ?? "a Root"} on{" "}
              {shortDate(link.createdAt)}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={url}
              aria-label="Family link"
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex gap-2">
              <Button ref={copyRef} type="button" variant="outline" onClick={() => copy(url)}>
                Copy
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={whatsappShareHref(url, treeName)}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                WhatsApp
              </Button>
            </div>
          </div>
          {full ? (
            <p className="text-sm text-muted-foreground">
              {link.maxUses < FAMILY_LINK_MAX_USES
                ? "Nobody else can join with it. Raise the cap or rotate it."
                : "Nobody else can join with it. Rotate it for a new one."}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {capPicker}
            <div className="flex gap-2">
              <ConfirmButton
                variant="outline"
                size="sm"
                disabled={action.pending}
                confirm={{
                  title: "Rotate the family link?",
                  description: "The current link stops working and the count starts again.",
                  destructive: false,
                  confirmLabel: "Rotate",
                  pendingLabel: "Rotating…",
                  onConfirm: () => rotateFamilyLink(treeId, cap),
                }}
              >
                Rotate
              </ConfirmButton>
              <ConfirmButton
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={action.pending}
                confirm={{
                  title: "Turn off the family link?",
                  description: "It stops working for anyone who hasn’t used it.",
                  confirmLabel: "Turn off",
                  pendingLabel: "Turning off…",
                  onConfirm: () => turnOffFamilyLink(treeId),
                  onSuccess: () => returnFocus(() => makeRef.current),
                }}
              >
                Turn off
              </ConfirmButton>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {capPicker}
          <PendingButton
            ref={makeRef}
            type="button"
            onClick={make}
            pending={action.pendingKey === "make"}
            disabled={action.pending}
            pendingLabel="Making…"
          >
            Make family link
          </PendingButton>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          Joined with it{joins.length > 0 ? ` (${joins.length})` : ""}
        </h3>
        {joins.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {joins.map((j) => (
              <li
                key={`${j.userId}-${j.joinedAt}`}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{j.name ?? "A member"}</span>
                  {j.accountType ? (
                    <AccountTypeBadge role={j.accountType.key} />
                  ) : (
                    <Badge variant="secondary">Left</Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {shortDate(j.joinedAt)}
                  {j.viaCurrentLink ? "" : " · earlier link"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
