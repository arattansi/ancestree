"use client";

import * as React from "react";
import Link from "next/link";

import { makeClaimLink, sendClaimInvite } from "@/app/actions/invites";
import { copyText } from "@/components/copy-text";
import { PendingButton } from "@/components/pending-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/use-action";
import type { Invitable } from "@/lib/invitable.server";
import { whatsappHref } from "@/lib/share-text";
import { shortDate } from "@/lib/short-date";
import { treeFocusHref } from "@/lib/tree-links";

/** Names shown before "show all". */
const FIRST_SHOWN = 10;

/** What a Root sends with a claim link (Step 143). */
export function claimLinkMessage(url: string, treeName: string): string {
  return `You’re on ${treeName} on ancestree. Claim your entry: ${url}`;
}

/**
 * The Root console's list of everyone living on the tree that nobody is
 * behind yet (Step 143): beside each name, an invite by email, or a link
 * to send any other way. Each says when one went out already. Settings
 * shows the same list of the people a member added (Step 151), where only
 * a Root of the tree gets the link (`canLink`).
 */
export function AdminClaimInvites({
  treeId,
  treeName,
  people,
  canLink = true,
}: {
  treeId: string;
  treeName: string;
  people: Invitable[];
  /** Offer a bare link beside the email: only a Root may make one. */
  canLink?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [all, setAll] = React.useState(false);

  if (people.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Everyone living on the tree has joined.
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const matching = q
    ? people.filter((p) => p.name.toLowerCase().includes(q))
    : people;
  const shown = all || q ? matching : matching.slice(0, FIRST_SHOWN);

  return (
    <div className="flex flex-col gap-3">
      {people.length > FIRST_SHOWN ? (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a name"
          aria-label="Find a name"
          autoComplete="off"
          className="sm:max-w-xs"
        />
      ) : null}
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {shown.map((p) => (
          <ClaimRow
            key={p.id}
            person={p}
            treeId={treeId}
            treeName={treeName}
            canLink={canLink}
          />
        ))}
      </ul>
      {matching.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one by that name.</p>
      ) : null}
      {!all && !q && people.length > FIRST_SHOWN ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => setAll(true)}
        >
          Show all {people.length}
        </Button>
      ) : null}
    </div>
  );
}

function ClaimRow({
  person,
  treeId,
  treeName,
  canLink,
}: {
  person: Invitable;
  treeId: string;
  treeName: string;
  canLink: boolean;
}) {
  const id = React.useId();
  const [open, setOpen] = React.useState<"email" | null>(null);
  const [email, setEmail] = React.useState("");
  const [url, setUrl] = React.useState<string | null>(null);
  const action = useAction({ inline: true });
  const invite = person.invite;

  function send(e: React.FormEvent) {
    e.preventDefault();
    action.run("send", () => sendClaimInvite(person.id, email, treeId), {
      success: (res) => (res.email ? `Invite emailed to ${res.email}.` : null),
      onSuccess: () => {
        setOpen(null);
        setEmail("");
      },
    });
  }

  function link() {
    action.run("link", () => makeClaimLink(person.id, treeId), {
      onSuccess: (res) => {
        if (!res.url) return;
        setUrl(res.url);
        void copyText(res.url, { copied: "Link copied" });
      },
    });
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={treeFocusHref(person.id)}
            className="truncate text-sm font-medium hover:underline"
          >
            {person.name}
          </Link>
          {person.bornYear ? (
            <span className="text-xs text-muted-foreground">
              b. {person.bornYear}
            </span>
          ) : null}
          {invite ? (
            <Badge variant={invite.live ? "secondary" : "outline"}>
              {invite.live
                ? `Invited ${shortDate(invite.sentAt)}`
                : "Invite expired"}
            </Badge>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={open === "email" ? "secondary" : "outline"}
            size="sm"
            aria-expanded={open === "email"}
            aria-controls={`${id}-email`}
            onClick={() => setOpen(open === "email" ? null : "email")}
          >
            email
          </Button>
          {canLink ? (
            <PendingButton
              type="button"
              variant="outline"
              size="sm"
              pending={action.pendingKey === "link"}
              pendingLabel="making…"
              disabled={action.pending}
              onClick={link}
            >
              copy link
            </PendingButton>
          ) : null}
        </div>
      </div>

      {open === "email" ? (
        <form
          id={`${id}-email`}
          onSubmit={send}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label={`${person.name}’s email`}
            autoComplete="off"
            autoFocus
          />
          <PendingButton
            type="submit"
            size="sm"
            className="sm:h-9"
            pending={action.pendingKey === "send"}
            pendingLabel="sending…"
            disabled={action.pending}
          >
            send invite
          </PendingButton>
        </form>
      ) : null}

      {url ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            readOnly
            value={url}
            aria-label={`Link for ${person.name}`}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sm:h-9"
              onClick={() => void copyText(url, { copied: "Link copied" })}
            >
              copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="sm:h-9"
              nativeButton={false}
              render={
                <a
                  href={whatsappHref(claimLinkMessage(url, treeName))}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              WhatsApp
            </Button>
          </div>
        </div>
      ) : null}

      {action.error ? (
        <p className="text-sm text-destructive" role="alert">
          {action.error}
        </p>
      ) : null}
    </li>
  );
}
