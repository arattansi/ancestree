"use client";

import * as React from "react";
import { toast } from "sonner";

import { setAccountType } from "@/app/actions/members";
import { AccountTypeGlyph } from "@/components/account-type-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ASSIGNABLE_ACCOUNT_TYPES, accountTypeOf } from "@/lib/account-types";

const ITEMS = ASSIGNABLE_ACCOUNT_TYPES.map((t) => ({
  value: t.key,
  label: t.name,
}));

/**
 * Root, on /admin: switch a member between Branch, Canopy and Leaf. Saves on
 * pick, and puts the old type back if the save doesn't take.
 */
export function AccountTypePicker({
  userId,
  role,
  name,
}: {
  userId: string;
  role: string;
  name: string;
}) {
  const [value, setValue] = React.useState(role);
  const [pending, startTransition] = React.useTransition();
  const current = accountTypeOf(value);

  function choose(next: string | null) {
    if (!next || next === value) return;
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const res = await setAccountType(userId, next);
      if (res.error) {
        setValue(previous);
        toast.error(res.error);
      } else {
        toast.success(`${name} is now ${accountTypeOf(next).name}.`);
      }
    });
  }

  return (
    <Select items={ITEMS} value={value} onValueChange={choose} disabled={pending}>
      <SelectTrigger
        size="sm"
        aria-label={`Account type for ${name}`}
        className="min-w-28"
      >
        <span className="flex items-center gap-1.5">
          <AccountTypeGlyph type={current} tinted className="size-3.5" />
          {current.name}
        </span>
      </SelectTrigger>
      <SelectContent className="w-auto min-w-60">
        {ASSIGNABLE_ACCOUNT_TYPES.map((t) => (
          <SelectItem key={t.key} value={t.key}>
            <AccountTypeGlyph type={t} tinted />
            <span className="flex flex-col">
              <span>{t.name}</span>
              <span className="text-xs text-muted-foreground">
                {t.tagline}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
