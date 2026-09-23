"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  dismissRelay,
  sendRelayedClaimInvite,
  sendRelayedInvite,
} from "@/app/actions/invite-relays";
import { JoinsAsNote } from "@/components/joins-as-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { INVITED_AS } from "@/lib/account-types";
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

/** What's working: the plain invite, one entry's invite, or dismissing. */
type Busy =
  | { kind: "send" }
  | { kind: "claim"; personId: string }
  | { kind: "dismiss" };

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
  const [busy, setBusy] = React.useState<Busy | null>(null);
  const idPrefix = `relay-${relay.id}`;
  const tree = trees.find((t) => t.id === treeId);
  const matches = relay.matches[treeId] ?? [];

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy({ kind: "send" });
    let res: Awaited<ReturnType<typeof sendRelayedInvite>>;
    try {
      res = await sendRelayedInvite(relay.id, treeId, { firstName, lastName, email });
    } catch {
      // A rejected server action (stale action id after a deploy, dropped
      // connection) must not strand the button on "Sending…".
      toast.error("Couldn't reach the server — reload the page and try again.");
      return;
    } finally {
      setBusy(null);
    }

    if (res.error) {
      toast.error(res.error);
      router.refresh();
      return;
    }
    const sent = res.results?.[0];
    if (!sent?.minted) {
      toast.error(`Couldn't invite ${email}: ${sent?.error ?? "unknown error"}`);
      return;
    }
    if (sent.emailed) {
      toast.success(`Invite emailed to ${sent.email} — they'll join as a ${INVITED_AS.name}.`);
    } else {
      toast.warning(
        `Link created for ${sent.email}, but the email didn't send${sent.error ? ` (${sent.error})` : ""}.`,
      );
    }
    router.refresh();
  }

  /**
   * Invite them as one of the entries their name matches: accepting claims
   * it and opens the tree on it (Step 30.2), with no search on onboarding.
   */
  async function onSendClaim(entry: SelfCandidate) {
    setBusy({ kind: "claim", personId: entry.id });
    let res: Awaited<ReturnType<typeof sendRelayedClaimInvite>>;
    try {
      res = await sendRelayedClaimInvite(relay.id, treeId, entry.id, email);
    } catch {
      toast.error("Couldn't reach the server — reload the page and try again.");
      return;
    } finally {
      setBusy(null);
    }

    if (!res.minted) {
      toast.error(res.error ?? "Couldn't send that invite. Try again.");
    } else if (res.error) {
      // Made, but its email didn't go: the ask is answered all the same.
      toast.warning(res.error);
    } else {
      toast.success(
        `Invite emailed to ${res.email} — accepting it claims the entry for ${entry.name}.`,
      );
    }
    router.refresh();
  }

  async function onDismiss() {
    setBusy({ kind: "dismiss" });
    let res: Awaited<ReturnType<typeof dismissRelay>>;
    try {
      res = await dismissRelay(relay.id);
    } catch {
      toast.error("Couldn't reach the server — reload the page and try again.");
      return;
    } finally {
      setBusy(null);
    }

    if (res.error) toast.error(res.error);
    else toast.success(`Dismissed. ${relay.firstName} isn’t told.`);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSend}
      className="flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">
          {relay.firstName} {relay.lastName} asked you to invite them
        </p>
        <p className="text-sm text-muted-foreground">
          <span suppressHydrationWarning>
            Asked{" "}
            {new Date(relay.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
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
                <Button
                  type="button"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => onSendClaim(c)}
                >
                  {busy?.kind === "claim" && busy.personId === c.id
                    ? "Sending…"
                    : `Invite as ${c.name}`}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <JoinsAsNote />

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          variant={matches.length > 0 ? "outline" : "default"}
          disabled={busy !== null || !treeId}
        >
          {busy?.kind === "send"
            ? "Sending…"
            : matches.length > 0
              ? "None of these, invite without an entry"
              : "Send invite"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={onDismiss}
        >
          {busy?.kind === "dismiss" ? "Dismissing…" : "Dismiss"}
        </Button>
      </div>
    </form>
  );
}
