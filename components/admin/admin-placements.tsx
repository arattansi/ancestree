"use client";

import * as React from "react";

import { removePlacement } from "@/app/actions/trees";
import { CarryPicker } from "@/components/carry-picker";
import { ConfirmButton } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import type { CarryLine, CarryPerson } from "@/lib/carry";
import type { CarriedPerson } from "@/lib/placements.server";

/** What a card brought over shows, and whose yes the rest waits on. */
function carriedBadge(p: CarriedPerson): string | null {
  if (p.approval === "asked") {
    return p.askedOf === "owner"
      ? "Basic · waiting for them"
      : "Basic · waiting for a Root or Branch";
  }
  if (p.approval === "declined") return "Basic · declined";
  return null;
}

/**
 * "People from other trees" (Steps 25 and 80): a Root brings a family line
 * over from a tree they're on, or anyone they can see there one by one.
 * Everyone arrives at once, whole or as a basic card while someone is asked.
 * Below, who has been brought over so far, how much of each is shown, and
 * a way to take them off again.
 */
export function AdminPlacements({
  treeId,
  people,
  lines,
  carried,
}: {
  treeId: string;
  people: CarryPerson[];
  lines: CarryLine[];
  carried: CarriedPerson[];
}) {
  const full = carried.filter(
    (p) => p.approval === "none" || p.approval === "approved",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Bring people over</h3>
        <CarryPicker treeId={treeId} people={people} lines={lines} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Brought over so far</h3>
          {carried.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {full} of {carried.length} in full
            </p>
          ) : null}
        </div>
        {carried.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody yet. Everyone on the tree so far calls it home.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {carried.map((p) => {
              const badge = carriedBadge(p);
              return (
                <li
                  key={p.placementId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Home: {p.homeTreeName ?? "another tree"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {badge ? (
                      <Badge
                        variant={p.approval === "declined" ? "outline" : "secondary"}
                      >
                        {badge}
                      </Badge>
                    ) : null}
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${p.name}`}
                      confirm={{
                        title: `Take ${p.name} off this tree?`,
                        confirmLabel: "Remove",
                        pendingLabel: "Removing…",
                        onConfirm: () => removePlacement(treeId, p.personId),
                      }}
                    >
                      Remove
                    </ConfirmButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
