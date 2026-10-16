"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { sendDirectInvites } from "@/app/actions/invites";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import {
  matchQuestion,
  type InviteMatch,
  type MatchAnswer,
} from "@/lib/invite-matches";

type Row = {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  /** The answer to "Is this …?" about the entry its name matched. */
  match: MatchAnswer | null;
};

function emptyRow(n: number): Row {
  return { key: `row-${n}`, firstName: "", lastName: "", email: "", match: null };
}

const filledIn = (r: Row) => r.firstName.trim() || r.lastName.trim() || r.email.trim();

/**
 * Email invites by name and address. Each joins as a Leaf, which the toast
 * no longer names (Step 171). A name that is exactly someone's on the tree
 * is asked about first (Step 162): "Is this Leila Haddad, b. 1961?" under
 * its row, and once every one is answered the invites go, a yes as an
 * invite to claim that entry.
 */
export function DirectInviteForm({
  treeId,
}: {
  /** The tree the invites are sent from, and into. */
  treeId: string;
}) {
  // Rows are counted by the form, from its first: a count kept by the module
  // ran on with every page the server drew, so its ids never matched the
  // browser's (Step 85). `useId` keeps two forms on a page apart.
  const formId = React.useId();
  const nextRow = React.useRef(1);
  const newRow = () => emptyRow(nextRow.current++);
  const idOf = (row: Row, field: string) => `${formId}-${row.key}-${field}`;
  const [rows, setRows] = React.useState<Row[]>(() => [emptyRow(0)]);
  // Why each row kept after a send is still there, by row key.
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  // The entry each row's name matched, to ask about, by row key.
  const [asks, setAsks] = React.useState<Record<string, InviteMatch>>({});
  const action = useAction({ inline: true });

  function updateRow(
    key: string,
    field: "firstName" | "lastName" | "email",
    value: string,
  ) {
    // A new name is a new question; a new address keeps the answer.
    const renamed = field !== "email";
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, [field]: value, match: renamed ? null : r.match } : r,
      ),
    );
    if (renamed && asks[key]) {
      setAsks((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function addRow() {
    const row = newRow();
    setRows((prev) => [...prev, row]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = rows.filter(filledIn);
    if (filled.length === 0) {
      action.setError("Add at least one person to invite.");
      return;
    }
    send(filled);
  }

  /**
   * "Is this …?" answered for one row. Once none is left waiting, what's
   * filled in goes, each with its answer.
   */
  function answer(row: Row, entry: InviteMatch, isThem: boolean) {
    const answered = rows.map((r) =>
      r.key === row.key ? { ...r, match: { entryId: entry.id, isThem } } : r,
    );
    setRows(answered);
    const filled = answered.filter(filledIn);
    const waiting = filled.some(
      (r) => asks[r.key] && r.match?.entryId !== asks[r.key].id,
    );
    if (!waiting) send(filled);
  }

  function send(filled: Row[]) {
    // They were about the last try.
    setReasons({});
    const rowsToSend = filled.map((r) => ({
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      match: r.match,
    }));
    action.run(
      "send",
      () => sendDirectInvites(treeId, rowsToSend),
      {
        // The emails are out of sight: say they went.
        success: (res) => {
          const succeeded = (res.results ?? []).filter((r) => r.minted && r.emailed);
          if (succeeded.length === 0) return null;
          return succeeded.length === 1
            ? `Invite emailed to ${succeeded[0].email}.`
            : `${succeeded.length} invites emailed.`;
        },
        onSuccess: (res) => {
          // Nothing went: some names are someone on the tree. Ask, by row.
          if (res.ask) {
            const byEmail = new Map(res.ask.map((q) => [q.email, q.entry]));
            setAsks(
              Object.fromEntries(
                filled.flatMap((r) => {
                  const entry = byEmail.get(r.email.trim().toLowerCase());
                  return entry ? [[r.key, entry]] : [];
                }),
              ),
            );
            return;
          }
          setAsks({});
          const results = res.results ?? [];
          const failed = results.filter((r) => !r.minted);
          const notEmailed = results.filter((r) => r.minted && !r.emailed);
          notEmailed.forEach((r) =>
            toast.warning(`Link created for ${r.email}, but the email didn't send${r.error ? ` (${r.error})` : ""}.`),
          );

          // Drop rows that fully succeeded; keep failures on screen to fix and
          // retry, each with why under it.
          const why = new Map<string, string>();
          for (const r of failed) {
            why.set(r.email, `Couldn't invite them: ${r.error ?? "unknown error"}`);
          }
          for (const r of notEmailed) {
            why.set(r.email, `The link was made, but the email didn't send${r.error ? ` (${r.error})` : ""}.`);
          }
          const reasonFor = (r: Row) => why.get(r.email.trim().toLowerCase());
          const remaining = filled.filter((r) => reasonFor(r) !== undefined);
          setRows(remaining.length > 0 ? remaining : [newRow()]);
          setReasons(Object.fromEntries(remaining.map((r) => [r.key, reasonFor(r) ?? ""])));
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={row.key} className="flex flex-col gap-1.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                {i === 0 ? <Label htmlFor={idOf(row, "first")}>First name</Label> : null}
                <Input
                  id={idOf(row, "first")}
                  value={row.firstName}
                  onChange={(e) => updateRow(row.key, "firstName", e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                {i === 0 ? <Label htmlFor={idOf(row, "last")}>Last name</Label> : null}
                <Input
                  id={idOf(row, "last")}
                  value={row.lastName}
                  onChange={(e) => updateRow(row.key, "lastName", e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                {i === 0 ? <Label htmlFor={idOf(row, "email")}>Email</Label> : null}
                <Input
                  id={idOf(row, "email")}
                  type="email"
                  value={row.email}
                  onChange={(e) => updateRow(row.key, "email", e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="off"
                  aria-describedby={reasons[row.key] ? idOf(row, "why") : undefined}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length === 1}
                onClick={() => removeRow(row.key)}
                aria-label="Remove row"
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            {reasons[row.key] ? (
              <p id={idOf(row, "why")} className="text-sm text-destructive">
                {reasons[row.key]}
              </p>
            ) : null}
            {asks[row.key] ? (
              <MatchQuestion
                entry={asks[row.key]}
                answer={row.match}
                // The first question takes focus as they appear.
                autoFocus={row.key === rows.find((r) => asks[r.key])?.key}
                disabled={action.pending}
                onAnswer={(isThem) => answer(row, asks[row.key], isThem)}
              />
            ) : null}
          </div>
        ))}
      </div>

      <FormError>{action.error}</FormError>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus aria-hidden />
          add another
        </Button>
        <PendingButton type="submit" size="sm" pending={action.pending} pendingLabel="sending…">
          send invites
        </PendingButton>
      </div>
    </form>
  );
}

/** "Is this Leila Haddad, b. 1961?" under a row, with yes and no. */
function MatchQuestion({
  entry,
  answer,
  autoFocus,
  disabled,
  onAnswer,
}: {
  entry: InviteMatch;
  answer: MatchAnswer | null;
  autoFocus: boolean;
  disabled: boolean;
  onAnswer: (isThem: boolean) => void;
}) {
  const id = React.useId();
  const chosen = answer?.entryId === entry.id ? answer.isThem : null;
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2"
    >
      <p id={id} className="text-sm font-medium text-foreground">
        {matchQuestion(entry)}
      </p>
      <div className="ml-auto flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={chosen === true ? "default" : "outline"}
          aria-pressed={chosen === true}
          autoFocus={autoFocus}
          disabled={disabled}
          onClick={() => onAnswer(true)}
        >
          yes
        </Button>
        <Button
          type="button"
          size="sm"
          variant={chosen === false ? "default" : "outline"}
          aria-pressed={chosen === false}
          disabled={disabled}
          onClick={() => onAnswer(false)}
        >
          no
        </Button>
      </div>
    </div>
  );
}
