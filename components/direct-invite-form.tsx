"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { sendDirectInvites, sendFounderInvites } from "@/app/actions/invites";
import { FormError } from "@/components/form-error";
import { JoinsAsNote } from "@/components/joins-as-note";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { INVITED_AS, ROOT } from "@/lib/account-types";

type Row = { key: string; firstName: string; lastName: string; email: string };

function emptyRow(n: number): Row {
  return { key: `row-${n}`, firstName: "", lastName: "", email: "" };
}

/** Email invites by name and address. Each joins as a Leaf. */
export function DirectInviteForm({
  treeId,
  founder = false,
}: {
  /** The tree the invites are sent from (and, unless `founder`, into). */
  treeId: string;
  /**
   * Founder invites (Step 25): each recipient starts a tree of their own as
   * its Root, rather than joining this one.
   */
  founder?: boolean;
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
  const action = useAction({ inline: true });

  function updateRow(key: string, field: keyof Omit<Row, "key">, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
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
    // They were about the last try.
    setReasons({});
    const filled = rows.filter((r) => r.firstName.trim() || r.lastName.trim() || r.email.trim());
    if (filled.length === 0) {
      action.setError("Add at least one person to invite.");
      return;
    }

    const rowsToSend = filled.map((r) => ({
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
    }));
    action.run(
      "send",
      () =>
        founder
          ? sendFounderInvites(treeId, rowsToSend)
          : sendDirectInvites(treeId, rowsToSend),
      {
        // The emails are out of sight: say they went.
        success: (res) => {
          const succeeded = (res.results ?? []).filter((r) => r.minted && r.emailed);
          if (succeeded.length === 0) return null;
          // A founder invite doesn't join this tree: they become the Root of a
          // tree of their own.
          const outcome = founder
            ? `start a tree of their own as its ${ROOT.name}`
            : `join as a ${INVITED_AS.name}`;
          return succeeded.length === 1
            ? `Invite emailed to ${succeeded[0].email} — they'll ${outcome}.`
            : `${succeeded.length} invites emailed — they'll ${founder ? "each " : ""}${outcome}.`;
        },
        onSuccess: (res) => {
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
          </div>
        ))}
      </div>

      {founder ? null : <JoinsAsNote />}

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
