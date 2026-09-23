"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  sendDirectInvites,
  type DirectInviteResult,
} from "@/app/actions/invites";
import {
  ACCOUNT_TYPE_TONE,
  AccountTypeGlyph,
} from "@/components/account-type-badge";
import { AccountTypeGuide } from "@/components/account-type-guide";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  ACCOUNT_TYPES,
  CANOPY,
  INVITABLE_ACCOUNT_TYPES,
  ROOT,
  accountTypeOf,
  type AccountTypeKey,
} from "@/lib/account-types";
import type { TreeInvite } from "@/lib/first-tree";
import { cn } from "@/lib/utils";

/**
 * How each account type comes to someone, beside what it is: the founder
 * is the Root, an invite makes someone Canopy or a Leaf, and a Branch (or
 * another Root) is given to someone who has already joined.
 */
const HOW_THEY_GET_IT: Record<AccountTypeKey, string> = {
  admin: "That’s you. You run the tree and decide what everyone else can do.",
  branch_admin:
    "For someone who knows one side of the family best. Make a member a Branch once they’ve joined.",
  member: "For relatives who’ll add family and fill in the details.",
  leaf: "For relatives who’d rather look: they keep their own entry up to date and can comment on the rest.",
};

type Row = {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  joinsAs: AccountTypeKey;
};

function blankRow(key: string): Row {
  return { key, firstName: "", lastName: "", email: "", joinsAs: CANOPY.key };
}



/**
 * The founder's first step (Step 29): who can do what on a tree, then an
 * invite for anyone they'd like to help. Each person gets their own account
 * type; the rows are sent one type at a time, as `sendDirectInvites` takes
 * them. Skippable — the canvas's "Getting started" list keeps it.
 */
export function InviteStep({
  treeId,
  invites,
  founderEntry,
  nextHref,
}: {
  treeId: string;
  /** Out from this tree and not yet taken up. */
  invites: TreeInvite[];
  /** Where the founder's own entry is: on this tree, on another, or nowhere yet. */
  founderEntry: "here" | "elsewhere" | "none";
  nextHref: string;
}) {
  const router = useRouter();
  // Row ids from `useId`, so the server's first render and the browser's
  // agree; rows added later count on from there.
  const idBase = React.useId();
  const nextRow = React.useRef(1);
  const [rows, setRows] = React.useState<Row[]>(() => [blankRow(`${idBase}-0`)]);
  const newRow = () => blankRow(`${idBase}-${nextRow.current++}`);
  const [pending, setPending] = React.useState(false);

  function update(key: string, patch: Partial<Omit<Row, "key">>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const filled = rows.filter(
      (r) => r.firstName.trim() || r.lastName.trim() || r.email.trim(),
    );
    if (filled.length === 0) {
      toast.error("Add someone to invite, or skip this step for now.");
      return;
    }

    setPending(true);
    const results: DirectInviteResult[] = [];
    try {
      for (const type of INVITABLE_ACCOUNT_TYPES) {
        const group = filled.filter((r) => r.joinsAs === type.key);
        if (group.length === 0) continue;
        const res = await sendDirectInvites(
          treeId,
          group.map(({ firstName, lastName, email }) => ({
            firstName,
            lastName,
            email,
          })),
          type.key,
        );
        if (res.error) {
          toast.error(res.error);
          return;
        }
        results.push(...(res.results ?? []));
      }
    } catch {
      // A rejected server action (stale id after a deploy, dropped
      // connection) mustn't leave the button on "Sending…".
      toast.error("Couldn't reach the server — reload the page and try again.");
      return;
    } finally {
      setPending(false);
    }

    const sent = results.filter((r) => r.minted && r.emailed);
    const unsent = results.filter((r) => r.minted && !r.emailed);
    const failed = results.filter((r) => !r.minted);
    if (sent.length > 0) {
      toast.success(
        sent.length === 1
          ? `Invite emailed to ${sent[0].email}.`
          : `${sent.length} invites emailed.`,
      );
    }
    unsent.forEach((r) =>
      toast.warning(
        `The invite for ${r.email} is ready, but the email didn't send. Resend it from your account's admin view.`,
      ),
    );
    failed.forEach((r) =>
      toast.error(`Couldn't invite ${r.email}: ${r.error ?? "unknown error"}`),
    );

    // Keep only the rows that failed outright, to fix and try again.
    const retry = new Set(failed.map((r) => r.email));
    const left = filled.filter((r) => retry.has(r.email.trim().toLowerCase()));
    setRows(left.length > 0 ? left : [newRow()]);
    if (sent.length + unsent.length > 0) router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Who Can Do What</CardTitle>
          <CardDescription>
            Four account types, named for the parts of a tree.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {ACCOUNT_TYPES.map((type) => (
              <li key={type.key} className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md border",
                    ACCOUNT_TYPE_TONE[type.key],
                  )}
                >
                  <AccountTypeGlyph type={type} className="size-5" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium text-foreground">{type.name}</span>
                    <span className="text-muted-foreground">{type.tagline}</span>
                    {type.key === ROOT.key ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground">{HOW_THEY_GET_IT[type.key]}</p>
                </div>
              </li>
            ))}
          </ul>
          <details className="group rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground marker:text-muted-foreground">
              Everything each type can do
            </summary>
            <div className="border-t border-border p-3">
              <AccountTypeGuide currentRole={ROOT.key} />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite Relatives</CardTitle>
          <CardDescription>
            Each gets an email that signs them straight in. Their own entries
            connect to yours
            {founderEntry === "here"
              ? ""
              : founderEntry === "elsewhere"
                ? ", which you’ll bring across next"
                : ", which you’ll add next"}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {invites.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Invited so far</p>
              <ul className="flex flex-col gap-1.5">
                {invites.map((invite) => {
                  const type = accountTypeOf(invite.joinsAs);
                  return (
                    <li
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{invite.name}</span>{" "}
                        <span className="text-muted-foreground">{invite.email}</span>
                        {invite.claims ? (
                          <span className="block text-xs text-muted-foreground">
                            To take over the entry for {invite.claims}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <AccountTypeGlyph type={type} tinted />
                          {type.name}
                        </span>
                        {invite.emailSent === false ? "· email didn’t send" : "· emailed"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-3">
              {rows.map((row, i) => (
                <fieldset
                  key={row.key}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1.4fr_8.5rem_auto] sm:items-end"
                >
                  <legend className="sr-only">Person {i + 1}</legend>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${row.key}-first`} className={cn(i > 0 && "sm:sr-only")}>
                      First name
                    </Label>
                    <Input
                      id={`${row.key}-first`}
                      value={row.firstName}
                      onChange={(e) => update(row.key, { firstName: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${row.key}-last`} className={cn(i > 0 && "sm:sr-only")}>
                      Last name
                    </Label>
                    <Input
                      id={`${row.key}-last`}
                      value={row.lastName}
                      onChange={(e) => update(row.key, { lastName: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${row.key}-email`} className={cn(i > 0 && "sm:sr-only")}>
                      Email
                    </Label>
                    <Input
                      id={`${row.key}-email`}
                      type="email"
                      value={row.email}
                      onChange={(e) => update(row.key, { email: e.target.value })}
                      placeholder="name@example.com"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${row.key}-type`} className={cn(i > 0 && "sm:sr-only")}>
                      Joins as
                    </Label>
                    <Select
                      value={row.joinsAs}
                      onValueChange={(v) => {
                        const type = INVITABLE_ACCOUNT_TYPES.find((t) => t.key === v);
                        if (type) update(row.key, { joinsAs: type.key });
                      }}
                    >
                      <SelectTrigger id={`${row.key}-type`} className="w-full">
                        <SelectValue>
                          {(value: string) => {
                            const type = accountTypeOf(value);
                            return (
                              <span className="flex items-center gap-1.5">
                                <AccountTypeGlyph type={type} tinted />
                                {type.name}
                              </span>
                            );
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {INVITABLE_ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type.key} value={type.key}>
                            <span className="flex items-center gap-1.5">
                              <AccountTypeGlyph type={type} tinted />
                              {type.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={rows.length === 1}
                    onClick={() =>
                      setRows((prev) => prev.filter((r) => r.key !== row.key))
                    }
                    aria-label={`Remove person ${i + 1}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </fieldset>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, newRow()])}
              >
                <Plus aria-hidden />
                Add another
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Sending…" : "Send invites"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          nativeButton={false}
          render={<Link href={nextHref} />}
          variant={invites.length > 0 ? "default" : "outline"}
        >
          {invites.length > 0 ? "Continue" : "Skip for now"}
        </Button>
        <p className="text-xs text-muted-foreground">
          You can invite people any time from the admin view of your account.
        </p>
      </div>
    </div>
  );
}
