"use client";

import * as React from "react";

import { updateRelationshipMarriage } from "@/app/actions/connections";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { SpouseDatesFields } from "@/components/spouse-dates-fields";
import { SheetFold } from "@/components/tree/sheet-fold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import {
  formatPartialDate,
  marriageDateProblems,
  toPartialIso,
  type DayMonth,
} from "@/lib/partial-date";
import { toStoredSpouseDates, type SpouseDates } from "@/lib/spouse-dates";

export type PersonRelation = {
  id: string;
  otherName: string;
  kind: "spouse" | "parent" | "child";
  marriageDate: string | null;
  /** A wedding day kept without its year, when there's no date (Step 63). */
  marriageWithoutYear: DayMonth | null;
  isDivorced: boolean;
  divorceDate: string | null;
  canEdit: boolean;
};

function SpouseRow({
  relation,
  onChanged,
}: {
  relation: PersonRelation;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const savedMarriage = toPartialIso(
    relation.marriageDate,
    "day",
    relation.marriageWithoutYear,
  );
  const saved: SpouseDates = {
    marriage_date: savedMarriage,
    is_divorced: relation.isDivorced,
    divorce_date: relation.divorceDate ?? "",
  };
  const [dates, setDates] = React.useState<SpouseDates>(saved);
  const idBase = `spouse-${relation.id}`;
  const action = useAction({ inline: true });
  // The sheet is non-modal, so nothing else keeps focus as the editor opens
  // and closes (Step 70).
  const returnFocus = useFocusReturn();
  const editRef = React.useRef<HTMLButtonElement>(null);
  // Marriage dates have to be whole (no precision column on relationships),
  // or a day and month without the year (Step 63).
  const dateProblems = marriageDateProblems({
    marriageDate: dates.marriage_date,
    isDivorced: dates.is_divorced,
    divorceDate: dates.divorce_date,
  });
  const datesOk = !dateProblems.marriage && !dateProblems.divorce;

  function save() {
    if (!datesOk) return;
    const stored = toStoredSpouseDates(dates);
    action.run(
      "save",
      () => updateRelationshipMarriage(relation.id, stored),
      {
        onSuccess: () => {
          returnFocus(() => editRef.current);
          setEditing(false);
          onChanged();
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Spouse / partner
        </span>
        <span className="text-sm text-foreground">{relation.otherName}</span>
        {relation.isDivorced ? (
          <Badge variant="outline">
            Divorced
            {relation.divorceDate
              ? ` ${formatPartialDate(relation.divorceDate)}`
              : ""}
          </Badge>
        ) : null}
      </div>

      {savedMarriage && !editing ? (
        <p className="text-xs text-muted-foreground">
          Married{" "}
          {formatPartialDate(
            relation.marriageDate,
            "day",
            relation.marriageWithoutYear,
          )}
        </p>
      ) : null}

      {!editing && relation.canEdit ? (
        <button
          ref={editRef}
          type="button"
          className="relative tap-target self-start text-xs text-foreground underline underline-offset-2"
          onClick={() => {
            setEditing(true);
            // The link makes way for the editor: its first box takes focus.
            returnFocus(() => document.getElementById(`${idBase}-marriage`));
          }}
        >
          {savedMarriage || relation.isDivorced
            ? "edit marriage / divorce"
            : "add marriage / divorce dates"}
        </button>
      ) : null}

      {editing ? (
        <div className="mt-1 flex flex-col gap-3">
          <SpouseDatesFields
            idBase={idBase}
            value={dates}
            onPatch={(patch) => setDates((d) => ({ ...d, ...patch }))}
            errors={dateProblems}
            boxed={false}
          />
          <FormError>{action.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              size="sm"
              onClick={save}
              pending={action.pending}
              disabled={!datesOk}
              pendingLabel="saving…"
            >
              save
            </PendingButton>
            <Button
              size="sm"
              variant="ghost"
              disabled={action.pending}
              onClick={() => {
                returnFocus(() => editRef.current);
                setEditing(false);
                setDates(saved);
                action.setError(null);
              }}
            >
              cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Folded away at first (Step 88.1): the canvas already shows the family. */
export function FamilySection({
  relations,
  onChanged,
  open,
  onOpenChange,
}: {
  relations: PersonRelation[];
  onChanged: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (relations.length === 0) return null;
  const spouses = relations.filter((r) => r.kind === "spouse");
  const parents = relations.filter((r) => r.kind === "parent");
  const children = relations.filter((r) => r.kind === "child");

  return (
    <SheetFold
      title="Family"
      count={relations.length}
      open={open}
      onOpenChange={onOpenChange}
    >
      {spouses.map((s) => (
        <SpouseRow key={s.id} relation={s} onChanged={onChanged} />
      ))}
      {parents.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">Parents</dt>
          <dd className="text-sm">
            {parents.map((p) => p.otherName).join(", ")}
          </dd>
        </div>
      ) : null}
      {children.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">
            Children
          </dt>
          <dd className="text-sm">
            {children.map((c) => c.otherName).join(", ")}
          </dd>
        </div>
      ) : null}
    </SheetFold>
  );
}
