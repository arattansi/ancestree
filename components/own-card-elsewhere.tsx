"use client";

import { makeCardNameOnly, showCardAgain } from "@/app/actions/trees";
import { ConfirmButton } from "@/components/confirm-dialog";
import { PendingButton } from "@/components/pending-button";
import { useAction } from "@/components/use-action";
import { NAME_ONLY } from "@/lib/carry";
import type { OwnCardElsewhere } from "@/lib/account-settings.server";

/**
 * Step 106: every tree but its home that shows a member's own card, and a
 * way to show only their name there — leaving it too, if they're a member —
 * or to show more again. What they make name only, no Root undoes.
 */
export function OwnCardElsewhereList({
  personId,
  trees,
}: {
  personId: string;
  trees: OwnCardElsewhere[];
}) {
  const again = useAction();
  if (trees.length === 0) return null;

  return (
    <ul className="divide-y divide-border rounded-md border border-border text-sm">
      {trees.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between gap-3 px-3 py-2"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{t.name}</span>
            {t.nameOnly ? (
              <span className="text-xs text-muted-foreground">
                {NAME_ONLY}
              </span>
            ) : null}
          </div>
          {t.nameOnly ? (
            <PendingButton
              size="sm"
              variant="outline"
              pending={again.pendingKey === t.id}
              disabled={again.pending}
              pendingLabel="showing…"
              aria-label={`Show more on ${t.name}`}
              onClick={() =>
                again.run(t.id, () => showCardAgain(t.id, personId), {
                  success: "Shown again.",
                })
              }
            >
              show more
            </PendingButton>
          ) : t.root || t.onlyTree ? null : (
            <ConfirmButton
              size="sm"
              variant="ghost"
              aria-label={`Show only your name on ${t.name}`}
              confirm={{
                title: `Show only your name on ${t.name}?`,
                description: t.member
                  ? `You'll leave ${t.name} too.`
                  : undefined,
                confirmLabel: t.member ? "name only and leave" : "name only",
                pendingLabel: "saving…",
                destructive: t.member,
                onConfirm: () => makeCardNameOnly(t.id, personId),
              }}
            >
              name only
            </ConfirmButton>
          )}
        </li>
      ))}
    </ul>
  );
}
