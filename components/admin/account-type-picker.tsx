"use client";

import * as React from "react";

import { setAccountType } from "@/app/actions/members";
import { AccountTypeGlyph } from "@/components/account-type-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { toastError, useAction } from "@/components/use-action";
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
  const action = useAction();
  // The picked type shows at once, and goes back by itself if the save
  // doesn't take.
  const [value, setValue] = React.useOptimistic(role);
  // Making a Root waits for a yes; until then the old type stays showing.
  const [askRoot, setAskRoot] = React.useState(false);
  const current = accountTypeOf(value);

  function choose(next: string | null) {
    if (!next || next === value) return;
    const refused = unavailable[next as AccountTypeKey];
    if (refused) {
      toastError(`${refused}.`);
      return;
    }
    if (next === ROOT.key) {
      setAskRoot(true);
      return;
    }
    action.run("type", async () => {
      setValue(next);
      return setAccountType(treeId, userId, next);
    });
  }

  return (
    <>
      <Select items={ITEMS} value={value} onValueChange={choose} disabled={action.pending}>
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
      <ConfirmDialog
        open={askRoot}
        onOpenChange={setAskRoot}
        title={`Make ${name} a Root?`}
        description={`They’ll hold the whole tree, as you do.\n${rootPlacesAfter(roots)}.\nThis cannot be undone.`}
        // Nothing is lost, but there's no way back: a plain confirm.
        destructive={false}
        confirmLabel="Make a Root"
        pendingLabel="Saving…"
        onConfirm={() => setAccountType(treeId, userId, ROOT.key)}
      />
    </>
  );
}
