"use client";

import * as React from "react";

import { makeClaimLink, sendClaimInvite } from "@/app/actions/invites";
import { copyText } from "@/components/copy-text";
import { PendingButton } from "@/components/pending-button";
import { noteShared } from "@/components/share-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/use-action";
import { whatsappHref } from "@/lib/share-text";
import { cn } from "@/lib/utils";

/** What a Root sends with a claim link (Step 143). */
export function claimLinkMessage(url: string, treeName: string): string {
  const on = treeName.trim() ? `${treeName.trim()} on ancestree` : "ancestree";
  return `You’re on ${on}. Claim your entry: ${url}`;
}

/**
 * An invite to claim one entry, by email or as a link to send any other
 * way (Step 143): the Root console's list, the people a member added
 * (Step 151), the founder's invite step and a person's sheet (Step 162).
 * `head` sits beside the two buttons; the email box and the link open
 * under them. Each copy and WhatsApp is counted (Step 216).
 */
export function ClaimInviteControls({
  personId,
  personName,
  treeId,
  treeName,
  emailLabel = "email",
  head,
  className,
}: {
  personId: string;
  personName: string;
  /** The tree they'd join, which shows the entry (Step 84). */
  treeId: string;
  treeName: string;
  /** The email button's label. */
  emailLabel?: string;
  head?: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [made, setMade] = React.useState<{ url: string; token?: string } | null>(null);
  const url = made?.url ?? null;
  const action = useAction({ inline: true });

  async function copy(text: string, token?: string) {
    if ((await copyText(text, { copied: "Link copied" })) && token) noteShared(token, "copy");
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    action.run("send", () => sendClaimInvite(personId, email, treeId), {
      success: (res) => (res.email ? `Invite emailed to ${res.email}.` : null),
      onSuccess: () => {
        setOpen(false);
        setEmail("");
      },
    });
  }

  function link() {
    action.run("link", () => makeClaimLink(personId, treeId), {
      onSuccess: (res) => {
        if (!res.url) return;
        setMade({ url: res.url, token: res.token });
        void copy(res.url, res.token);
      },
    });
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {head}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={open ? "secondary" : "outline"}
            size="sm"
            aria-expanded={open}
            aria-controls={`${id}-email`}
            onClick={() => setOpen(!open)}
          >
            {emailLabel}
          </Button>
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
        </div>
      </div>

      {open ? (
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
            placeholder="them@example.com"
            aria-label={`${personName}’s email`}
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
            aria-label={`Link for ${personName}`}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sm:h-9"
              onClick={() => void copy(url, made?.token)}
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
                  onClick={() => {
                    if (made?.token) noteShared(made.token, "whatsapp");
                  }}
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
    </div>
  );
}
