"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { placePeople, removePlacement } from "@/app/actions/trees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type {
  ForeignPlacement,
  PlacementCandidate,
} from "@/lib/placements.server";

/**
 * "People from other trees" (Step 25): a Root picks anyone they can see on
 * another tree and shows them here. A member's own entry waits for that
 * member's yes; everyone else appears at once. Below, who has been brought
 * over so far, and a way to take them off again.
 */
export function AdminPlacements({
  treeId,
  candidates,
  placed,
}: {
  treeId: string;
  candidates: PlacementCandidate[];
  placed: ForeignPlacement[];
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const shown = candidates.filter((c) =>
    c.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onBring() {
    if (picked.size === 0) return;
    setBusy(true);
    const res = await placePeople(treeId, [...picked]);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const pending = (res.placed ?? []).filter((p) => p.status === "pending").length;
    const active = (res.placed ?? []).length - pending;
    toast.success(
      [
        active > 0 ? `${active} now on the tree` : null,
        pending > 0 ? `${pending} waiting for their yes` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Done",
    );
    setPicked(new Set());
    router.refresh();
  }

  async function onRemove(p: ForeignPlacement) {
    setBusy(true);
    const res = await removePlacement(treeId, p.personId);
    setBusy(false);
    if (res.error) toast.error(res.error);
    else toast.success(`${p.name} is off this tree.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Bring people over</h3>
          <Button size="sm" onClick={onBring} disabled={busy || picked.size === 0}>
            {busy ? "Bringing…" : `Bring ${picked.size || ""} over`.trim()}
          </Button>
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Everyone you can see on your other trees is already here, or you
            aren&rsquo;t on another tree yet.
          </p>
        ) : (
          <>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find someone by name"
              aria-label="Find someone by name"
            />
            <ul className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {shown.map((c) => {
                const id = `place-${c.id}`;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox
                      id={id}
                      checked={picked.has(c.id)}
                      onCheckedChange={(on) => toggle(c.id, on === true)}
                    />
                    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {c.name}
                        {c.lifespan ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {c.lifespan}
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        On {c.fromTrees.join(", ") || "another tree"}
                        {c.needsConsent ? " · their own entry, so they’ll be asked" : ""}
                      </span>
                    </label>
                  </li>
                );
              })}
              {shown.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">Nobody by that name.</li>
              ) : null}
            </ul>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Brought over so far</h3>
        {placed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody yet. Everyone on the tree so far calls it home.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {placed.map((p) => (
              <li key={p.placementId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Home: {p.homeTreeName ?? "another tree"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === "pending" ? (
                    <Badge variant="secondary">Waiting for them</Badge>
                  ) : p.status === "declined" ? (
                    <Badge variant="outline">Declined</Badge>
                  ) : null}
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(p)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
