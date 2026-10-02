"use client";

import { Fragment, useState } from "react";

import { createShareLink, revokeShareLink } from "@/app/actions/share-links";
import { ConfirmButton } from "@/components/confirm-dialog";
import { copyText } from "@/components/copy-text";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { SHARE_LINK_DAYS, SHARE_LINK_LABEL_MAX } from "@/lib/limits";
import { countOf } from "@/lib/plural";
import { shareLinkState } from "@/lib/share-links";
import { shortDate } from "@/lib/short-date";

export type ShareLinkRow = {
  id: string;
  token: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
};

function copy(text: string) {
  void copyText(text, { copied: "Share link copied" });
}

export function ShareLinkManager({
  treeId,
  links,
  baseUrl,
}: {
  treeId: string;
  links: ShareLinkRow[];
  baseUrl: string;
}) {
  const shareUrl = (token: string) => `${baseUrl}/shared/${token}`;

  const [label, setLabel] = useState("");
  const [withExpiry, setWithExpiry] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const action = useAction({ inline: true });

  function mint() {
    action.run("create", () => createShareLink({ treeId, label, withExpiry }), {
      onSuccess: (result) => {
        setFreshUrl(result.url ?? null);
        setLabel("");
        setWithExpiry(false);
        // The panel it opens says it's copied.
        // No word when it worked: the panel below says so.
        if (result.url) void copyText(result.url, { copied: null });
      },
    });
  }

  const active = links.filter((l) => !l.revokedAt);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="share-label">Label (optional)</Label>
          <Input
            id="share-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Grandma's side, reunion 2026"
            maxLength={SHARE_LINK_LABEL_MAX}
          />
        </div>
        <Label
          htmlFor="share-expiry"
          className="flex items-center gap-2.5 text-sm font-normal text-muted-foreground"
        >
          <Checkbox
            id="share-expiry"
            checked={withExpiry}
            onCheckedChange={(v) => setWithExpiry(v === true)}
          />
          Expire this link after {SHARE_LINK_DAYS} days
        </Label>
        <FormError>{action.error}</FormError>
        <PendingButton
          type="button"
          onClick={mint}
          pending={action.pending}
          pendingLabel="creating…"
          className="self-start"
        >
          create share link
        </PendingButton>
      </div>

      {freshUrl ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-sm text-muted-foreground">
            View-only link — copied to your clipboard. Anyone with it can see the
            tree but not edit it.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={freshUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={() => copy(freshUrl)}>
              copy
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          Active links{active.length > 0 ? ` (${active.length})` : ""}
        </h3>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active share links.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {active.map((link) => {
              const state = shareLinkState({
                revoked_at: link.revokedAt,
                expires_at: link.expiresAt,
              });
              // What a screen reader hears on the row's buttons, to tell
              // one link from another.
              const which = link.label ? `the “${link.label}” link` : "the untitled link";
              return (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {link.label || "Untitled link"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        countOf(link.viewCount, "view"),
                        link.lastViewedAt
                          ? `last viewed ${shortDate(link.lastViewedAt)}`
                          : null,
                        link.expiresAt
                          ? state === "expired"
                            ? "expired"
                            : `expires ${shortDate(link.expiresAt)}`
                          : "no expiry",
                      ]
                        .filter(Boolean)
                        .map((part, i) => (
                          // A narrow screen breaks the line between parts,
                          // never inside a date.
                          <Fragment key={i}>
                            {i > 0 ? "\u00a0· " : null}
                            <span className="whitespace-nowrap">{part}</span>
                          </Fragment>
                        ))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copy(shareUrl(link.token))}
                      aria-label={`Copy ${which}`}
                    >
                      copy
                    </Button>
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      aria-label={`Revoke ${which}`}
                      confirm={{
                        title: link.label ? `Revoke “${link.label}”?` : "Revoke this link?",
                        description: "It stops working for anyone who has it.",
                        confirmLabel: "revoke",
                        pendingLabel: "revoking…",
                        onConfirm: () => revokeShareLink(link.id),
                      }}
                    >
                      revoke
                    </ConfirmButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
