"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { dismissRelay, sendRelayedInvite } from "@/app/actions/invite-relays";
import { JoinsAsNote } from "@/components/joins-as-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { INVITED_AS } from "@/lib/account-types";

/** An ask a newcomer passed on to this member (Step 30.5), as they typed it. */
export type PendingRelay = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
};

export type RelayTree = { id: string; name: string };

/**
 * The asks passed on to this member (Step 30.5), each an invite filled in
 * with what the newcomer typed: one tap sends it, as any invite they send.
 * A member of several trees picks which to invite them to, starting from
 * the tree they're looking at.
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
  const [busy, setBusy] = React.useState<"send" | "dismiss" | null>(null);
  const idPrefix = `relay-${relay.id}`;

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy("send");
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

  async function onDismiss() {
    setBusy("dismiss");
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

      <JoinsAsNote />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy !== null || !treeId}>
          {busy === "send" ? "Sending…" : "Send invite"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={onDismiss}
        >
          {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
        </Button>
      </div>
    </form>
  );
}
