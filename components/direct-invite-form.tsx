"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { sendDirectInvites } from "@/app/actions/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { key: string; firstName: string; lastName: string; email: string };

let nextKey = 0;
function emptyRow(): Row {
  return { key: `row-${nextKey++}`, firstName: "", lastName: "", email: "" };
}

export function DirectInviteForm() {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[]>([emptyRow()]);
  const [pending, setPending] = React.useState(false);

  function updateRow(key: string, field: keyof Omit<Row, "key">, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = rows.filter((r) => r.firstName.trim() || r.lastName.trim() || r.email.trim());
    if (filled.length === 0) {
      toast.error("Add at least one person to invite.");
      return;
    }

    setPending(true);
    const res = await sendDirectInvites(
      filled.map((r) => ({ firstName: r.firstName, lastName: r.lastName, email: r.email })),
    );
    setPending(false);

    if (res.error) {
      toast.error(res.error);
      return;
    }

    const results = res.results ?? [];
    const failed = results.filter((r) => !r.minted);
    const notEmailed = results.filter((r) => r.minted && !r.emailed);
    const succeeded = results.filter((r) => r.minted && r.emailed);

    if (succeeded.length > 0) {
      toast.success(
        succeeded.length === 1
          ? `Invite emailed to ${succeeded[0].email}.`
          : `${succeeded.length} invites emailed.`,
      );
    }
    notEmailed.forEach((r) =>
      toast.warning(`Link created for ${r.email}, but the email didn't send${r.error ? ` (${r.error})` : ""}.`),
    );
    failed.forEach((r) => toast.error(`Couldn't invite ${r.email}: ${r.error ?? "unknown error"}`));

    // Drop rows that fully succeeded; keep failures on screen to fix and retry.
    const failedEmails = new Set([...failed, ...notEmailed].map((r) => r.email));
    const remaining = filled.filter((r) => failedEmails.has(r.email.trim().toLowerCase()));
    setRows(remaining.length > 0 ? remaining : [emptyRow()]);

    if (succeeded.length > 0) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={row.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              {i === 0 ? <Label htmlFor={`${row.key}-first`}>First name</Label> : null}
              <Input
                id={`${row.key}-first`}
                value={row.firstName}
                onChange={(e) => updateRow(row.key, "firstName", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {i === 0 ? <Label htmlFor={`${row.key}-last`}>Last name</Label> : null}
              <Input
                id={`${row.key}-last`}
                value={row.lastName}
                onChange={(e) => updateRow(row.key, "lastName", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {i === 0 ? <Label htmlFor={`${row.key}-email`}>Email</Label> : null}
              <Input
                id={`${row.key}-email`}
                type="email"
                value={row.email}
                onChange={(e) => updateRow(row.key, "email", e.target.value)}
                placeholder="you@example.com"
                autoComplete="off"
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
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus aria-hidden />
          Add another
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send invites"}
        </Button>
      </div>
    </form>
  );
}
