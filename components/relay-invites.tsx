"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  dismissRelay,
  sendRelayedClaimInvite,
  sendRelayedInvite,
} from "@/app/actions/invite-relays";
import type { DirectInviteResult } from "@/app/actions/invites";
import { FormError } from "@/components/form-error";
import { JoinsAsNote } from "@/components/joins-as-note";
import { PendingButton } from "@/components/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toastError, useAction } from "@/components/use-action";
import { refocusAfterRemoval } from "@/components/use-focus-return";
import { INVITED_AS } from "@/lib/account-types";
import { RELAY_ANSWERED, relayLapsesAt } from "@/lib/invite-relays";
import {
  candidateSummary,
  matchConfidence,
  type SelfCandidate,
} from "@/lib/self-match";

/** An ask a newcomer passed on to this member (Step 30.5), as they typed it. */
export type PendingRelay = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  /**
   * The entries their name matches on each of the member's trees, by tree
   * id, best first: those the member may invite someone to claim
   * (`invite_relay_candidates`, Step 41.1). A tree with none has no key.
   */
  matches: Record<string, SelfCandidate[]>;
};

export type RelayTree = { id: string; name: string };

/** How a plain invite went, once its one row has been looked at. */
type SendOutcome = { error?: string; sent?: DirectInviteResult };

/** How a claim invite went: made, and `warning` if its email didn't go. */
type ClaimOutcome = { error?: string; warning?: string; email?: string };

function shortDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The asks passed on to this member (Step 30.5), each an invite filled in
 * with what the newcomer typed: one tap sends it, as any invite they send.
 * A member of several trees picks which to invite them to, starting from
 * the tree they're looking at. Where their name matches entries on that
 * tree that the member may hand over, each can be sent as an invite to
 * claim it instead (Step 41.1), and the plain invite stays for none of them.
 */
export function RelayInvites({
  relays,
  trees,
  defaultTreeId,
}: {
  relays: PendingRelay[];
  /** Every tree they're on: any member may invite into any of them. */
  trees: RelayTree[];
  defaultTreeId: string | null;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {relays.map((relay) => (
        <li key={relay.id}>
          <RelayInviteForm relay={relay} trees={trees} defaultTreeId={defaultTreeId} />
        </li>
      ))}
    </ul>
  );
}

function RelayInviteForm({
  relay,
  trees,
  defaultTreeId,
}: {
  relay: PendingRelay;
  trees: RelayTree[];
  defaultTreeId: string | null;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState(relay.firstName);
  const [lastName, setLastName] = React.useState(relay.lastName);
  const [email, setEmail] = React.useState(relay.email);
  const [treeId, setTreeId] = React.useState(
    trees.find((t) => t.id === defaultTreeId)?.id ?? trees[0]?.id ?? "",
  );
  // One call at a time for the card: its buttons all answer the same ask.
  // What goes wrong shows by them.
  const action = useAction({ inline: true });
  const formRef = React.useRef<HTMLFormElement>(null);
  const idPrefix = `relay-${relay.id}`;
  const tree = trees.find((t) => t.id === treeId);
  const matches = relay.matches[treeId] ?? [];

  /**
   * After a refusal, the asks as they stand: this one may have been
   * answered from elsewhere. If it was, its card goes with the redraw, and
   * the message by its buttons with it, so that one's a toast.
   */
  function redraw(error: string) {
    router.refresh();
    if (error === RELAY_ANSWERED) toastError(error);
  }

  /** Answered, the card goes: focus moves on to the next ask's. */
  function answered() {
    refocusAfterRemoval(formRef.current);
  }

  /**
   * Enter in a field submits the form. With entries listed that would answer
   * "none of these" for them, so then only the button itself sends it.
   */
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (matches.length === 0) onSend();
  }

  function onSend() {
    action.run(
      "send",
      async (): Promise<SendOutcome> => {
        const res = await sendRelayedInvite(relay.id, treeId, {
          firstName,
          lastName,
          email,
        });
        if (res.error) {
          redraw(res.error);
          return { error: res.error };
        }
        const sent = res.results?.[0];
        if (!sent?.minted) {
          return {
            error: `Couldn't invite ${email}: ${sent?.error ?? "unknown error"}`,
          };
        }
        return { sent };
      },
      {
        onSuccess: ({ sent }) => {
          if (!sent) return;
          answered();
          if (sent.emailed) {
            toast.success(
              `Invite emailed to ${sent.email} — they'll join as a ${INVITED_AS.name}.`,
            );
          } else {
            toast.warning(
              `Link created for ${sent.email}, but the email didn't send${sent.error ? ` (${sent.error})` : ""}.`,
            );
          }
        },
      },
    );
  }

  /**
   * Invite them as one of the entries their name matches: accepting claims
   * it and opens the tree on it (Step 30.2), with no search on onboarding.
   */
  function onSendClaim(entry: SelfCandidate) {
    action.run(
      `claim:${entry.id}`,
      async (): Promise<ClaimOutcome> => {
        const res = await sendRelayedClaimInvite(
          relay.id,
          treeId,
          entry.id,
          email,
        );
        if (!res.minted) {
          const error = res.error ?? "Couldn't send that invite. Try again.";
          // A sent invite needs no redraw, as its action draws the page
          // again.
          redraw(error);
          return { error };
        }
        // Made, but its email didn't go: the ask is answered all the same.
        return { warning: res.error, email: res.email };
      },
      {
        onSuccess: ({ warning, email: sentTo }) => {
          answered();
          if (warning) toast.warning(warning);
          else {
            toast.success(
              `Invite emailed to ${sentTo} — accepting it claims the entry for ${entry.name}.`,
            );
          }
        },
      },
    );
  }

  function onDismiss() {
    action.run(
      "dismiss",
      async () => {
        const res = await dismissRelay(relay.id);
        if (res.error) redraw(res.error);
        return res;
      },
      {
        // The page can't show that they aren't told.
        success: `Dismissed. ${relay.firstName} isn’t told.`,
        onSuccess: answered,
      },
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">
          {relay.firstName} {relay.lastName} asked you to invite them
        </p>
        <p className="text-sm text-muted-foreground">
          {/* Unanswered, it lapses after 30 days (Step 41.5). */}
          <span suppressHydrationWarning>
            Asked {shortDate(new Date(relay.createdAt))}, and waits until{" "}
            {shortDate(relayLapsesAt(relay.createdAt))}
          </span>
          . Their details are as they typed them, so put anything right before
          you send.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-first`}>First name</Label>
          <Input
            id={`${idPrefix}-first`}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-last`}>Last name</Label>
          <Input
            id={`${idPrefix}-last`}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-email`}>Email</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {trees.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">
            Invite them to
          </legend>
          <RadioGroup
            value={treeId}
            onValueChange={(v) => {
              if (typeof v === "string") setTreeId(v);
            }}
          >
            {trees.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm has-data-checked:border-ring"
              >
                <RadioGroupItem value={t.id} />
                <span className="font-medium text-foreground">{t.name}</span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      ) : trees.length === 1 ? (
        <p className="text-sm text-muted-foreground">
          Their invite is to{" "}
          <span className="font-medium text-foreground">{trees[0].name}</span>.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          You&rsquo;re not on a tree just now, so there&rsquo;s nowhere to
          invite them.
        </p>
      )}

      {matches.length > 0 ? (
        // The entries on that tree their name matches (Step 41.1): often
        // them under another spelling, which is why request access missed
        // them. Inviting them as one hands it over as they accept.
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Their name matches{" "}
            {matches.length === 1 ? "this entry" : "these entries"} on{" "}
            <span className="font-medium text-foreground">
              {tree?.name ?? "the tree"}
            </span>
            . Inviting them as an entry hands it to them: accepting claims it
            and opens the tree on it.
          </p>
          <ul className="flex flex-col gap-2">
            {matches.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <span className="truncate">{c.name}</span>
                    {matchConfidence(c.score) === "close" ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        close match
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {candidateSummary(c)}
                  </p>
                </div>
                <PendingButton
                  type="button"
                  size="sm"
                  pending={action.pendingKey === `claim:${c.id}`}
                  disabled={action.pending}
                  pendingLabel="Sending…"
                  onClick={() => onSendClaim(c)}
                >
                  Invite as {c.name}
                </PendingButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <JoinsAsNote />

      <FormError>{action.error}</FormError>
      <div className="flex flex-wrap gap-2">
        <PendingButton
          // Not the form's submit while entries are listed, so Enter in a
          // field can't choose "none of these" (`onSubmit`).
          type={matches.length > 0 ? "button" : "submit"}
          onClick={matches.length > 0 ? () => onSend() : undefined}
          size="sm"
          variant={matches.length > 0 ? "outline" : "default"}
          pending={action.pendingKey === "send"}
          disabled={action.pending || !treeId}
          pendingLabel="Sending…"
        >
          {matches.length > 0
            ? "None of these, invite without an entry"
            : "Send invite"}
        </PendingButton>
        <PendingButton
          type="button"
          size="sm"
          variant="ghost"
          pending={action.pendingKey === "dismiss"}
          disabled={action.pending}
          pendingLabel="Dismissing…"
          onClick={onDismiss}
        >
          Dismiss
        </PendingButton>
      </div>
    </form>
  );
}
