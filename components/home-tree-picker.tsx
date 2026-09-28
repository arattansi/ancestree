"use client";

import * as React from "react";

import { setHiddenFromVisitors, setHomeTree } from "@/app/actions/trees";
import { PendingButton } from "@/components/pending-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/components/use-action";

export type HomeTreeOption = { id: string; name: string };

/**
 * A member's say over their own entry across trees (Step 25): which tree is
 * its home — whose rules govern it — and whether visitors from other trees
 * see it or a blur.
 */
export function HomeTreePicker({
  personId,
  homeTreeId,
  options,
  hiddenFromVisitors,
}: {
  personId: string;
  homeTreeId: string;
  /** Every tree that shows the entry. */
  options: HomeTreeOption[];
  hiddenFromVisitors: boolean;
}) {
  const [choice, setChoice] = React.useState(homeTreeId);
  // Two settings, each saved on its own.
  const move = useAction();
  const hide = useAction();
  // Ticks at once, and goes back by itself if the save doesn't work.
  const [hidden, setHidden] = React.useOptimistic(hiddenFromVisitors);

  function onMove() {
    if (choice === homeTreeId) return;
    move.run("move", () => setHomeTree(personId, choice), {
      onError: () => setChoice(homeTreeId),
    });
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-2">
        <Label htmlFor="home-tree">Home tree</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={choice}
            onValueChange={(v) => setChoice(String(v ?? homeTreeId))}
          >
            <SelectTrigger id="home-tree" className="w-full min-w-0 sm:flex-1">
              {/* Base UI shows the raw value unless told the label. */}
              <SelectValue>
                {(value: string) =>
                  options.find((o) => o.id === value)?.name ?? ""
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PendingButton
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={onMove}
            pending={move.pending}
            disabled={choice === homeTreeId || options.length < 2}
            pendingLabel="Moving…"
          >
            Move home
          </PendingButton>
        </div>
        <p className="text-xs text-muted-foreground">
          Your details follow your home tree&rsquo;s rules: its Roots can edit
          them and undo a Branch&rsquo;s change; other trees only place your
          card. You control your entry on every tree regardless.
        </p>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="hide-visitors"
          checked={hidden}
          onCheckedChange={(on) =>
            hide.run("hide", async () => {
              setHidden(on === true);
              return setHiddenFromVisitors(personId, on === true);
            })
          }
        />
        <Label htmlFor="hide-visitors" className="font-normal leading-snug">
          Hide my entry from visitors — people viewing a tree I&rsquo;m on from
          another tree see a blurred card with no name or details.
        </Label>
      </div>
    </div>
  );
}
