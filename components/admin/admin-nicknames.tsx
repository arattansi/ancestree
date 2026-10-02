"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  addNickname,
  removeNickname,
  removeNicknameGroup,
} from "@/app/actions/nicknames";
import { ConfirmButton } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError, useAction } from "@/components/use-action";
import { refocusAfterRemoval } from "@/components/use-focus-return";
import { UNREACHABLE } from "@/lib/action-feedback";
import {
  filterNicknameGroups,
  nicknameInputError,
  type NicknameGroup,
} from "@/lib/nicknames";
import { countOf } from "@/lib/plural";

type Removal = { canonical: string; variant: string };

/**
 * Admin panel for the nickname groups behind the onboarding name search
 * (Step 15.1). The seed is English-centric, so this is where the family's own
 * nicknames get added — every pair here is a name someone is called *instead
 * of* their root name, not merely one that resembles it.
 */
export function AdminNicknames({ groups }: { groups: NicknameGroup[] }) {
  const [root, setRoot] = React.useState("");
  const [nickname, setNickname] = React.useState("");
  const [query, setQuery] = React.useState("");
  const add = useAction({ inline: true });
  // A nickname leaves its group as soon as its × is pressed, and comes back
  // by itself if the removal fails.
  const [shown, hide] = React.useOptimistic(
    groups,
    (list: NicknameGroup[], { canonical, variant }: Removal) =>
      list.map((g) =>
        g.canonical === canonical
          ? { ...g, variants: g.variants.filter((v) => v !== variant) }
          : g,
      ),
  );

  const visible = React.useMemo(
    () => filterNicknameGroups(shown, query),
    [shown, query],
  );

  function onAdd(event: React.FormEvent) {
    event.preventDefault();
    const invalid = nicknameInputError(root, nickname);
    if (invalid) {
      add.setError(invalid);
      return;
    }
    add.run("add", () => addNickname(root, nickname), {
      // Names the group it joined, as stored: folded, maybe not as typed.
      success: (res) => `Added to the ${res.canonical} group.`,
      onSuccess: () => setNickname(""),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onAdd} className="flex flex-col gap-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname-root">Root name</Label>
            <Input
              id="nickname-root"
              placeholder="Robert"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname-variant">Goes by</Label>
            <Input
              id="nickname-variant"
              placeholder="Bob"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <PendingButton type="submit" pending={add.pending} pendingLabel="adding…">
            add
          </PendingButton>
        </div>
        <FormError>{add.error}</FormError>
        <p className="text-xs text-muted-foreground">
          Names are stored lowercase without accents or punctuation. Adding to
          an existing root extends that group; a new root starts one.
        </p>
      </form>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname-search">Find a group</Label>
            <Input
              id="nickname-search"
              placeholder="bob"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sm:w-64"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {visible.length} of {countOf(groups.length, "group")}
          </p>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {groups.length === 0
              ? "No nickname groups yet."
              : `Nothing matches "${query}".`}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((g) => (
              <li
                key={g.canonical}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
              >
                <span className="font-medium">{g.canonical}</span>
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
                {g.variants.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    no nicknames yet
                  </span>
                ) : (
                  g.variants.map((v) => (
                    <Nickname key={v} canonical={g.canonical} variant={v} hide={hide} />
                  ))
                )}
                <ConfirmButton
                  variant="link"
                  className="relative tap-target ml-auto h-auto p-0 text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-destructive"
                  confirm={{
                    title: `Remove the ${g.canonical} group?`,
                    // A group with no nicknames matches nothing: nothing is lost.
                    description:
                      g.variants.length > 0
                        ? `Search on every tree stops matching ${g.canonical} with its nicknames.\nThis cannot be undone.`
                        : undefined,
                    confirmLabel: "remove",
                    pendingLabel: "removing…",
                    onConfirm: () => removeNicknameGroup(g.canonical),
                  }}
                >
                  remove group
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * One nickname in its group, with a × that takes it out at once and offers
 * Undo: it's cheap to put back, so nothing asks first. Each has its own
 * call, so a second × doesn't wait for the first.
 */
function Nickname({
  canonical,
  variant,
  hide,
}: Removal & { hide: (removal: Removal) => void }) {
  const action = useAction();

  function onRemove(event: React.MouseEvent<HTMLButtonElement>) {
    // The name leaves with its ×, which had focus: the next name's × gets it.
    refocusAfterRemoval(event.currentTarget);
    action.run(
      "remove",
      async () => {
        hide({ canonical, variant });
        return removeNickname(canonical, variant);
      },
      {
        onSuccess: () =>
          toast(`Removed ${variant} from ${canonical}.`, {
            action: {
              label: "undo",
              onClick: () => {
                void addNickname(canonical, variant).then(
                  (res) => res?.error && toastError(res.error),
                  () => toastError(UNREACHABLE),
                );
              },
            },
          }),
      },
    );
  }

  return (
    <span
      data-row
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm"
    >
      {variant}
      <button
        type="button"
        aria-label={`Remove ${variant} from ${canonical}`}
        className="relative tap-target text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );
}
