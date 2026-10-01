"use client";

import * as React from "react";

import { forgetHeldBackDetails, showHeldBackDetails } from "@/app/actions/people";
import { ConfirmButton } from "@/components/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  setPersonSheet,
  usePersonSheet,
} from "@/components/tree/use-person-sheet";
import { heldBackRows, type HeldBackGroup } from "@/lib/held-back";

const NOTE =
  "rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground";

/**
 * A placeholder's held-back details (Step 98.3), on its sheet. Its parent
 * ticks what the family may see and shows it, or forgets the lot; the child,
 * once it's their own entry, sees what's kept and that it waits on their
 * parent. Nobody else is sent any (`withheld_details`).
 */
export function HeldBackDetails({
  personId,
  name,
  asParent,
}: {
  personId: string;
  /** "First Child", for the questions. */
  name: string;
  /** Their parent; else the child themself. */
  asParent: boolean;
}) {
  const rows = heldBackRows(usePersonSheet(personId)?.sheet.heldBack);
  const [ticked, setTicked] = React.useState<ReadonlySet<HeldBackGroup>>(
    () => new Set(["name"]),
  );

  if (!asParent) {
    return (
      <div className="flex flex-col gap-3">
        <p className={NOTE}>
          Your details are hidden from the family until your parent approves.
        </p>
        {rows.length > 0 ? (
          <dl className="grid grid-cols-2 gap-4">
            {rows.map((r) => (
              <div key={r.group} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{r.label}</dt>
                <dd className="text-sm">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    );
  }

  if (rows.length === 0) return <p className={NOTE}>Only you can fill this in.</p>;

  const chosen = rows.filter((r) => ticked.has(r.group));
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Hidden from the family</p>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <label key={r.group} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={ticked.has(r.group)}
              // Their name always goes with anything shown.
              disabled={r.group === "name"}
              onCheckedChange={(c) =>
                setTicked((now) => {
                  const next = new Set(now);
                  if (c === true) next.add(r.group);
                  else next.delete(r.group);
                  return next;
                })
              }
            />
            <span>
              <span className="text-muted-foreground">{r.label}:</span> {r.value}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <ConfirmButton
          size="sm"
          confirm={{
            title: `Show ${listOf(chosen.map((r) => r.label.toLowerCase()))} to the family?`,
            confirmLabel: "Show",
            pendingLabel: "Showing…",
            destructive: false,
            onConfirm: () => showHeldBackDetails(personId, [...ticked]),
            onSuccess: () => setPersonSheet(personId, "heldBack", () => ({})),
          }}
        >
          Show to the family
        </ConfirmButton>
        <ConfirmButton
          size="sm"
          variant="outline"
          confirm={{
            title: `Forget ${name}’s hidden details?`,
            description: "This cannot be undone.",
            confirmLabel: "Forget",
            pendingLabel: "Forgetting…",
            onConfirm: () => forgetHeldBackDetails(personId),
            onSuccess: () => setPersonSheet(personId, "heldBack", () => ({})),
          }}
        >
          Forget them
        </ConfirmButton>
      </div>
    </div>
  );
}

/** "name", "name and sex", "name, date of birth and sex". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
