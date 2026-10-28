"use client";

import * as React from "react";

import { makeClaimLink, sendClaimInvite } from "@/app/actions/invites";
import { FormError } from "@/components/form-error";
import { JoinsAsNote } from "@/components/joins-as-note";
import { PendingButton } from "@/components/pending-button";
import {
  noteShared,
  ShareMessage,
  shareSheet,
  useShareDevice,
} from "@/components/share-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/use-action";
import { addedYouMessage } from "@/lib/family-link";

/**
 * Someone just added, offered their own link to claim the entry (Step
 * 214): few have a relative's email, so the link goes in a chat, with a
 * message ready (`addedYouMessage`), and email is the second way. The
 * link is made only when asked for (`makeClaimLink`, whose rules say who
 * may), and on a phone the share sheet opens with it where the browser
 * still allows; the buttons stay for when it doesn't. Shown only for
 * someone `offersTheirLink` allows.
 */
export function SendTheirLink({
  personId,
  firstName,
  treeId,
  treeName,
}: {
  personId: string;
  /** What they're called on the button: "send Amara their link". */
  firstName: string;
  /** The tree they'd join, which shows the entry (Step 84). */
  treeId: string;
  treeName: string;
}) {
  const { sheet } = useShareDevice();
  const action = useAction({ inline: true });
  const [sent, setSent] = React.useState<{ message: string; token?: string } | null>(null);
  const [emailing, setEmailing] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [emailed, setEmailed] = React.useState<string | null>(null);
  const them = firstName.trim() || "them";

  function link() {
    action.run("link", () => makeClaimLink(personId, treeId), {
      onSuccess: ({ url, token }) => {
        if (!url) return;
        const text = addedYouMessage(url, treeName);
        setSent({ message: text, token });
        if (sheet) {
          void shareSheet(text).then((shared) => {
            if (shared && token) noteShared(token, "share");
          });
        }
      },
    });
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    action.run("send", () => sendClaimInvite(personId, email, treeId), {
      onSuccess: (res) => {
        if (res.email) setEmailed(res.email);
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {sent ? (
        <ShareMessage message={sent.message} inviteToken={sent.token} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <PendingButton
            type="button"
            pending={action.pendingKey === "link"}
            pendingLabel="making…"
            disabled={action.pending}
            onClick={link}
          >
            send {them} their link
          </PendingButton>
          {emailing || emailed ? null : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEmailing(true)}
            >
              or email it
            </Button>
          )}
        </div>
      )}

      {emailed ? (
        <p className="text-sm text-muted-foreground" role="status">
          Invite emailed to {emailed}.
        </p>
      ) : emailing ? (
        <form
          onSubmit={send}
          className="flex flex-col gap-2"
          noValidate
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              inputMode="email"
              required
              // Not "email": that would fill in the member's own.
              autoComplete="off"
              placeholder="them@example.com"
              aria-label={`${them}’s email`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={action.pending}
              autoFocus
            />
            <PendingButton
              type="submit"
              variant="outline"
              pending={action.pendingKey === "send"}
              pendingLabel="sending…"
              disabled={action.pending || !email.trim()}
            >
              send invite
            </PendingButton>
          </div>
          <JoinsAsNote />
        </form>
      ) : null}

      <FormError>{action.error}</FormError>
    </div>
  );
}
