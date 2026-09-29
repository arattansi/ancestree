"use client";

import { DateField } from "@/components/date-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { SpouseDates } from "@/lib/spouse-dates";
import { cn } from "@/lib/utils";

/**
 * A marriage's dates (Steps 11.5, 29, 77.4): the marriage, whether they
 * later divorced, and when. In a form, where the rest is asked for too, they
 * sit in a box of their own and say they're optional (`boxed`); on a
 * spouse's row, where they're all that's being edited, they don't.
 *
 * Ids are `{idBase}-marriage`, `{idBase}-divorced` and `{idBase}-divorce`,
 * so a caller can hand focus to the first.
 */
export function SpouseDatesFields({
  idBase,
  value,
  onPatch,
  errors,
  boxed = true,
}: {
  idBase: string;
  value: SpouseDates;
  onPatch: (patch: SpouseDates) => void;
  errors?: { marriage?: string | null; divorce?: string | null };
  boxed?: boolean;
}) {
  const optional = boxed ? " (optional)" : "";
  const labelClass = boxed ? "text-xs font-normal" : "text-xs";
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        boxed && "rounded-md border border-dashed border-border p-3",
      )}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-marriage`} className={labelClass}>
          Marriage date{optional}
        </Label>
        <DateField
          id={`${idBase}-marriage`}
          value={value.marriage_date ?? ""}
          onChange={(v) => onPatch({ marriage_date: v })}
          aria-invalid={Boolean(errors?.marriage)}
        />
        {errors?.marriage ? (
          <p className="text-xs text-destructive">{errors.marriage}</p>
        ) : null}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Checkbox
          id={`${idBase}-divorced`}
          checked={value.is_divorced ?? false}
          onCheckedChange={(c) => onPatch({ is_divorced: c === true })}
        />
        <span>They later divorced</span>
      </label>
      {value.is_divorced ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idBase}-divorce`} className={labelClass}>
            Divorce date{optional}
          </Label>
          <DateField
            id={`${idBase}-divorce`}
            value={value.divorce_date ?? ""}
            onChange={(v) => onPatch({ divorce_date: v })}
            aria-invalid={Boolean(errors?.divorce)}
          />
          {errors?.divorce ? (
            <p className="text-xs text-destructive">{errors.divorce}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
