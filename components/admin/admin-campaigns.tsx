"use client";

import * as React from "react";

import {
  createCampaign,
  setCampaignPaused,
  updateCampaign,
} from "@/app/actions/campaigns";
import { copyText } from "@/components/copy-text";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import {
  CAMPAIGN_NAME_MAX,
  CAMPAIGN_PLACEMENT_MAX,
  campaignCounts,
  campaignHref,
  type Campaign,
} from "@/lib/campaigns";

/**
 * Campaign links on the admin page's manage tab (Step 103.3): open links
 * anyone can sign up and start a tree through, no approval. Make one,
 * note where it's posted, copy it, see its counts, pause or resume it.
 */
export function AdminCampaigns({
  campaigns,
  baseUrl,
}: {
  campaigns: Campaign[];
  baseUrl: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <NewCampaign />
      <RowList items={campaigns} empty="No links yet.">
        {(c) => <CampaignRow key={c.id} campaign={c} baseUrl={baseUrl} />}
      </RowList>
    </div>
  );
}

function NewCampaign() {
  const action = useAction({ inline: true });
  const [name, setName] = React.useState("");
  const [placement, setPlacement] = React.useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    action.run("make", () => createCampaign(name, placement), {
      onSuccess: () => {
        setName("");
        setPlacement("");
      },
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="campaign-name">Name</Label>
          <Input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={CAMPAIGN_NAME_MAX}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="campaign-placement">Where it&rsquo;s posted</Label>
          <Input
            id="campaign-placement"
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            maxLength={CAMPAIGN_PLACEMENT_MAX}
          />
        </div>
      </div>
      <FormError>{action.error}</FormError>
      <PendingButton
        type="submit"
        className="self-start"
        pending={action.pending}
        pendingLabel="making…"
        disabled={!name.trim()}
      >
        make link
      </PendingButton>
    </form>
  );
}

function CampaignRow({ campaign: c, baseUrl }: { campaign: Campaign; baseUrl: string }) {
  const action = useAction();
  const edit = useAction({ inline: true });
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(c.name);
  const [placement, setPlacement] = React.useState(c.placement ?? "");
  const url = `${baseUrl}${campaignHref(c.code)}`;
  const nameId = `campaign-${c.id}-name`;
  const placementId = `campaign-${c.id}-placement`;

  function startEditing() {
    setName(c.name);
    setPlacement(c.placement ?? "");
    edit.setError(null);
    setEditing(true);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    edit.run("save", () => updateCampaign(c.id, name, placement), {
      onSuccess: () => setEditing(false),
    });
  }

  return (
    <RowCard>
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={CAMPAIGN_NAME_MAX}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={placementId}>Where it&rsquo;s posted</Label>
              <Input
                id={placementId}
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                maxLength={CAMPAIGN_PLACEMENT_MAX}
              />
            </div>
          </div>
          <FormError>{edit.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              type="submit"
              size="sm"
              pending={edit.pending}
              pendingLabel="saving…"
              disabled={!name.trim()}
            >
              save
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={edit.pending}
              onClick={() => setEditing(false)}
            >
              cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              <span className="break-words">{c.name}</span>
              {c.paused ? <Badge variant="secondary">Paused</Badge> : null}
            </p>
            {c.placement ? (
              <p className="break-words text-muted-foreground">{c.placement}</p>
            ) : null}
            <p className="text-muted-foreground tabular-nums">{campaignCounts(c)}</p>
          </div>
          <button
            type="button"
            onClick={startEditing}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Edit
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={url}
          aria-label={`${c.name} link`}
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyText(url, { copied: "Link copied" })}
          >
            copy
          </Button>
          <PendingButton
            type="button"
            variant="outline"
            pending={action.pending}
            pendingLabel={c.paused ? "resuming…" : "pausing…"}
            onClick={() =>
              action.run("pause", () => setCampaignPaused(c.id, !c.paused))
            }
          >
            {c.paused ? "resume" : "pause"}
          </PendingButton>
        </div>
      </div>
    </RowCard>
  );
}
