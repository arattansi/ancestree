"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  joinDateParts,
  MONTH_NAMES,
  splitDateParts,
  type DateParts,
} from "@/lib/partial-date";
import { cn } from "@/lib/utils";

/** The month picker's "no month" choice; Base UI needs a real value for it. */
const NO_MONTH = "__none";

const MONTH_VALUES = MONTH_NAMES.map((_, i) => String(i + 1).padStart(2, "0"));

// Base UI shows an item's raw value in the closed trigger unless it is given
// the labels, which would read "05" instead of "May".
const MONTH_ITEMS: Record<string, string> = {
  [NO_MONTH]: "—",
  ...Object.fromEntries(MONTH_VALUES.map((v, i) => [v, MONTH_NAMES[i]])),
};

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * A date typed as Day / Month / Year, in that order.
 *
 * It replaced the browser's date picker, which on a phone is a wheel that
 * starts at today — scrolling back to 1931 was the whole complaint — and which
 * can't say "only the year". Day and year are plain number boxes (a numeric
 * keypad on a phone); the month is a short list, so there is no day/month
 * order to guess.
 *
 * The value is one string, `year-month-day` with any part allowed to be empty
 * (see `splitDateParts`), so half-typed input survives and the form's own
 * validation can say what's missing. With `allowPartial` off the date has to be
 * whole — the schema or the caller checks that with `dateProblem`.
 *
 * `id`, `aria-invalid` and `aria-describedby` arrive from `FormControl`: the id
 * goes on the day box so the field's label focuses it.
 */
export function DateField({
  id,
  value,
  onChange,
  onBlur,
  disabled = false,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}) {
  const parts = splitDateParts(value);
  const month = parts.month
    ? String(Number(parts.month)).padStart(2, "0")
    : null;

  function update(next: Partial<DateParts>) {
    onChange(joinDateParts({ ...parts, ...next }));
  }

  return (
    <div
      role="group"
      aria-describedby={ariaDescribedBy}
      className={cn("flex items-center gap-2", className)}
    >
      <Input
        id={id}
        aria-label="Day"
        aria-invalid={ariaInvalid}
        inputMode="numeric"
        // Not `bday-day`: that would fill in the member's own birthday on a
        // relative's entry.
        autoComplete="off"
        placeholder="Day"
        maxLength={2}
        value={parts.day}
        disabled={disabled}
        onChange={(e) => update({ day: digits(e.target.value) })}
        onBlur={onBlur}
        className="w-16"
      />
      <Select
        items={MONTH_ITEMS}
        value={month}
        disabled={disabled}
        onValueChange={(v) =>
          update({ month: !v || v === NO_MONTH ? "" : String(v) })
        }
      >
        <SelectTrigger
          aria-label="Month"
          aria-invalid={ariaInvalid}
          className="min-w-0 flex-1"
          onBlur={onBlur}
        >
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={NO_MONTH}>—</SelectItem>
          {MONTH_VALUES.map((v, i) => (
            <SelectItem key={v} value={v}>
              {MONTH_NAMES[i]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label="Year"
        aria-invalid={ariaInvalid}
        inputMode="numeric"
        autoComplete="off"
        placeholder="Year"
        maxLength={4}
        value={parts.year}
        disabled={disabled}
        onChange={(e) => update({ year: digits(e.target.value) })}
        onBlur={onBlur}
        className="w-20"
      />
    </div>
  );
}
