"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  rotateFamilyLink,
  setFamilyLinkCap,
  turnOffFamilyLink,
} from "@/app/actions/family-link";
import { AccountTypeBadge } from "@/components/account-type-badge";
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
  const router = useRouter();
  const serverCap = link?.maxUses ?? FAMILY_LINK_MAX_USES;
  const [cap, setCap] = React.useState(serverCap);
  const [seenCap, setSeenCap] = React.useState(serverCap);
  const [pending, startTransition] = React.useTransition();

  // A rotation, or another Root's change, brings a new cap from the server.
  if (seenCap !== serverCap) {
    setSeenCap(serverCap);
    setCap(serverCap);
  }

  const url = link ? `${baseUrl}/join/${link.token}` : null;
  const full = link ? isFamilyLinkFull(link) : false;

  async function copy(text: string, silent = false) {
    try {
      await navigator.clipboard.writeText(text);
      if (!silent) toast.success("Family link copied");
    } catch {
      if (!silent) toast.error("Couldn't copy. Select the link and copy it.");
    }
  }

  function make() {
    startTransition(async () => {
      const res = await rotateFamilyLink(treeId, cap);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(link ? "New link made. The old one no longer works." : "Family link made.");
      router.refresh();
    });
  }

  function rotate() {
    if (
      !window.confirm(
        "Rotate the family link?\nThe current link stops working and the count starts again.",
      )
    ) {
      return;
    }
    make();
  }

  function changeCap(next: number) {
    setCap(next);
    if (!link || next === link.maxUses) return;
    startTransition(async () => {
      const res = await setFamilyLinkCap(treeId, next);
      if (res.error) {
        toast.error(res.error);
        setCap(link.maxUses);
        return;
      }
      toast.success(`Cap set to ${next}.`);
      router.refresh();
    });
  }

  function turnOff() {
    if (!window.confirm("Turn off the family link?\nIt stops working for anyone who hasn't used it.")) {
      return;
    }
    startTransition(async () => {
      const res = await turnOffFamilyLink(treeId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Family link turned off.");
      router.refresh();
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
        disabled={pending}
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
              <Button type="button" variant="outline" onClick={() => copy(url)}>
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
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={rotate}>
                {pending ? "Working…" : "Rotate"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={pending}
                onClick={turnOff}
              >
                Turn off
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {capPicker}
          <Button type="button" onClick={make} disabled={pending}>
            {pending ? "Making…" : "Make family link"}
          </Button>
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
