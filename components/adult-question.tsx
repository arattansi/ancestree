"use client";

import * as React from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * "Is {name} 18 or older?" (Step 98), asked of someone being added who could
 * be a child, unless the member adding them is their parent
 * (`lib/minors.ts#newPeopleToAsk`). Unanswered until picked: a "No" stops
 * the save, and the database asks the same.
 */
export function AdultQuestion({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: boolean | undefined;
  onChange: (adult: boolean) => void;
  disabled?: boolean;
}) {
  // Not the form's field ids: those are made afresh in the browser, so the
  // page as served wouldn't match it.
  const id = React.useId();
  const labelId = `${id}-label`;
  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-sm font-medium">
        Is {name} 18 or older?
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        className="flex flex-row gap-6"
        value={value === undefined ? null : value ? "yes" : "no"}
        onValueChange={(v) => onChange(v === "yes")}
        disabled={disabled}
      >
        {(["yes", "no"] as const).map((v) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <RadioGroupItem id={`${id}-${v}`} value={v} />
            {v === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
