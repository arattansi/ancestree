"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createShareLink, revokeShareLink } from "@/app/actions/share-links";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shareLinkState } from "@/lib/share-links";

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

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Share link copied");
  } catch {
    toast.error("Couldn't copy — select and copy the link manually");
  }
}

export function ShareLinkManager({
  links,
  baseUrl,
}: {
  links: ShareLinkRow[];
  baseUrl: string;
}) {
  const shareUrl = (token: string) => `${baseUrl}/shared/${token}`;

  const [label, setLabel] = useState("");
  const [withExpiry, setWithExpiry] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function mint() {
    startTransition(async () => {
      const result = await createShareLink({ label, withExpiry });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setFreshUrl(result.url ?? null);
      setLabel("");
      setWithExpiry(false);
      if (result.url) await copy(result.url);
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
            maxLength={80}
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
          Expire this link after 30 days
        </Label>
        <Button type="button" onClick={mint} disabled={pending} className="self-start">
          {pending ? "Creating…" : "Create share link"}
        </Button>
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
              Copy
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
                      {link.viewCount} view{link.viewCount === 1 ? "" : "s"}
                      {link.expiresAt
                        ? state === "expired"
                          ? " · expired"
                          : ` · expires ${new Date(link.expiresAt).toLocaleDateString()}`
                        : " · no expiry"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copy(shareUrl(link.token))}
                    >
                      Copy
                    </Button>
                    <form action={revokeShareLink}>
                      <input type="hidden" name="id" value={link.id} />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                      >
                        Revoke
                      </Button>
                    </form>
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
