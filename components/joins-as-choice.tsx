"use client";

import { AccountTypeGlyph } from "@/components/account-type-badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { accountTypeOf, type AccountTypeKey } from "@/lib/account-types";

/**
 * What an invite makes someone (Step 18.2): Canopy or Leaf, from whichever the
 * inviter may give. With only one on offer — a Branch's Leaf — it says so
 * rather than showing a choice of one.
 */
export function JoinsAsChoice({
  options,
  value,
  onChange,
  disabled = false,
}: {
  /** Widest first, as `invitableTypes` returns them. */
  options: readonly AccountTypeKey[];
  value: AccountTypeKey;
  onChange: (key: AccountTypeKey) => void;
  disabled?: boolean;
}) {
  if (options.length === 1) {
    const only = accountTypeOf(options[0]);
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <AccountTypeGlyph type={only} tinted className="mt-0.5" />
        <span>
          They&rsquo;ll join as a{" "}
          <span className="font-medium text-foreground">{only.name}</span>:{" "}
          {only.tagline.charAt(0).toLowerCase() + only.tagline.slice(1)}. A Root
          can change that later.
        </span>
      </p>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">They&rsquo;ll join as</legend>
      <RadioGroup
        value={value}
        onValueChange={(v) => {
          const next = options.find((key) => key === v);
          if (next) onChange(next);
        }}
        className="grid gap-2 sm:grid-cols-2"
      >
        {options.map((key) => {
          const type = accountTypeOf(key);
          return (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-data-checked:border-ring"
            >
              <RadioGroupItem value={key} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  <AccountTypeGlyph type={type} tinted />
                  {type.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {type.tagline}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
