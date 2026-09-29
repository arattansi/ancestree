"use client";

import * as React from "react";

import { answerPlacements } from "@/app/actions/trees";
import { PendingButton } from "@/components/pending-button";
import { useAction } from "@/components/use-action";
import type { PlacementAsk } from "@/lib/placements.server";

type Group = {
  treeId: string;
  treeName: string;
  askedBy: string[];
  asks: PlacementAsk[];
};

/** Asks side by side under the tree that's asking, in the order they came. */
function byTree(asks: readonly PlacementAsk[]): Group[] {
  const groups = new Map<string, Group>();
  for (const ask of asks) {
    let group = groups.get(ask.treeId);
    if (!group) {
      group = { treeId: ask.treeId, treeName: ask.treeName, askedBy: [], asks: [] };
      groups.set(ask.treeId, group);
    }
    group.asks.push(ask);
    if (ask.askedByName && !group.askedBy.includes(ask.askedByName)) {
      group.askedBy.push(ask.askedByName);
    }
  }
  return [...groups.values()];
}

function whose(ask: PlacementAsk): string {
  return ask.own ? "Your entry" : ask.personName;
}

/** Under a name in the list of what no longer waits. */
function standing(ask: PlacementAsk): string {
  if (ask.approval === "approved") return "In full";
  return ask.approval === "lapsed" ? "Basic details · no answer" : "Basic details";
}

/**
 * What's been asked of a member (Step 80): to show the whole of their own
 * entry, or of entries they may edit, on a tree that has their name and
 * place of birth already. Waiting ones first, a tree at a time, each
 * answered by itself or all at once; then what no longer waits, answered
 * or lapsed after 30 days (Step 83), where the answer can still be given
 * or changed.
 */
export function PlacementAsks({ asks }: { asks: PlacementAsk[] }) {
  const action = useAction();
  const waiting = byTree(asks.filter((a) => a.approval === "asked"));
  const earlier = asks.filter((a) => a.approval !== "asked");

  function answer(
    key: string,
    ids: string[],
    accept: boolean,
    /** Said instead, when an answer already given is being changed. */
    changed?: string,
  ) {
    action.run(key, () => answerPlacements(ids, accept), {
      success: (res) => {
        if (changed) return changed;
        const n = res.answered ?? ids.length;
        if (!accept) return n === 1 ? "Declined." : `${n} declined.`;
        return n === 1 ? "Approved." : `${n} approved.`;
      },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {waiting.map((group) => (
        <section key={group.treeId} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {group.treeName}
              {group.askedBy.length > 0 ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  asked by {group.askedBy.join(", ")}
                </span>
              ) : null}
            </h3>
            {group.asks.length > 1 ? (
              <PendingButton
                size="sm"
                pending={action.pendingKey === `all:${group.treeId}`}
                disabled={action.pending}
                pendingLabel="Approving…"
                onClick={() =>
                  answer(
                    `all:${group.treeId}`,
                    group.asks.map((a) => a.placementId),
                    true,
                  )
                }
              >
                Approve all {group.asks.length}
              </PendingButton>
            ) : null}
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {group.asks.map((ask) => (
              <li
                key={ask.placementId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{whose(ask)}</span>
                  {ask.own ? null : (
                    <span className="truncate text-xs text-muted-foreground">
                      Home: {ask.homeTreeName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <PendingButton
                    size="sm"
                    variant={group.asks.length > 1 ? "outline" : "default"}
                    pending={action.pendingKey === `yes:${ask.placementId}`}
                    disabled={action.pending}
                    pendingLabel="Approving…"
                    aria-label={`Approve ${whose(ask)} on ${group.treeName}`}
                    onClick={() =>
                      answer(`yes:${ask.placementId}`, [ask.placementId], true)
                    }
                  >
                    Approve
                  </PendingButton>
                  <PendingButton
                    size="sm"
                    variant="ghost"
                    pending={action.pendingKey === `no:${ask.placementId}`}
                    disabled={action.pending}
                    pendingLabel="Declining…"
                    aria-label={`Decline ${whose(ask)} on ${group.treeName}`}
                    onClick={() =>
                      answer(`no:${ask.placementId}`, [ask.placementId], false)
                    }
                  >
                    Decline
                  </PendingButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {earlier.length > 0 ? (
        <details className="text-sm" open={waiting.length === 0}>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Earlier ({earlier.length})
          </summary>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {earlier.map((ask) => {
              const full = ask.approval === "approved";
              return (
                <li
                  key={ask.placementId}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{whose(ask)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {ask.treeName} · {standing(ask)}
                    </span>
                  </div>
                  <PendingButton
                    size="sm"
                    variant="outline"
                    pending={action.pendingKey === `change:${ask.placementId}`}
                    disabled={action.pending}
                    pendingLabel="Saving…"
                    aria-label={`${full ? "Show basic details only of" : "Show in full"} ${whose(ask)} on ${ask.treeName}`}
                    onClick={() =>
                      answer(
                        `change:${ask.placementId}`,
                        [ask.placementId],
                        !full,
                        full ? "Now basic details only." : "Now shown in full.",
                      )
                    }
                  >
                    {full ? "Show basic details only" : "Show in full"}
                  </PendingButton>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
