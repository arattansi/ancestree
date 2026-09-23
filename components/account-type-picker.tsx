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
import {
  ASSIGNABLE_ACCOUNT_TYPES,
  ROOT,
  accountTypeOf,
  rootPlacesAfter,
  type AccountTypeKey,
} from "@/lib/account-types";

const ITEMS = ASSIGNABLE_ACCOUNT_TYPES.map((t) => ({
  value: t.key,
  label: t.name,
}));

/**
 * Root, on /admin: switch a member between Leaf and Branch, or make them a
 * Root. Saves on pick, and puts the old type back if the save doesn't
 * take. Making a Root asks first: it can't be undone, by anyone (Step 22.5).
 * A type the tree has no room for (Step 39) is shown but can't be picked,
 * with the reason where its line would be.
 */
export function AccountTypePicker({
  treeId,
  userId,
  role,
  name,
  roots,
  unavailable = {},
}: {
  treeId: string;
  userId: string;
  role: string;
  name: string;
  /** Roots on the tree now, for the confirm's word on how many are left. */
  roots: number;
  /** Why a type can't be picked now (`whyUnavailable`), by key. */
  unavailable?: Partial<Record<AccountTypeKey, string>>;
}) {
  const [value, setValue] = React.useState(role);
  const [pending, startTransition] = React.useTransition();
  const current = accountTypeOf(value);

  function choose(next: string | null) {
    if (!next || next === value) return;
    const refused = unavailable[next as AccountTypeKey];
    if (refused) {
      toast.error(`${refused}.`);
      return;
    }
    if (
      next === ROOT.key &&
      !window.confirm(
        `Make ${name} a Root? They'll hold the whole tree, just as you do: every entry and connection, members and invites, deleting entries. ${rootPlacesAfter(roots)} A Root stays a Root — nobody, you included, can change that later.`,
      )
    ) {
      return;
    }
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const res = await setAccountType(treeId, userId, next);
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
          <SelectItem key={t.key} value={t.key} disabled={!!unavailable[t.key]}>
            <AccountTypeGlyph type={t} tinted />
            <span className="flex flex-col">
              <span>{t.name}</span>
              <span className="text-xs text-muted-foreground">
                {unavailable[t.key] ?? t.tagline}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
