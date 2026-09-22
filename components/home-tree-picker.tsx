"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setHiddenFromVisitors, setHomeTree } from "@/app/actions/trees";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const router = useRouter();
  const [choice, setChoice] = React.useState(homeTreeId);
  const [busy, setBusy] = React.useState(false);

  async function onMove() {
    if (choice === homeTreeId) return;
    setBusy(true);
    const res = await setHomeTree(personId, choice);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      setChoice(homeTreeId);
      return;
    }
    toast.success("Your entry has a new home.");
    router.refresh();
  }

  async function onHide(on: boolean) {
    setBusy(true);
    const res = await setHiddenFromVisitors(personId, on);
    setBusy(false);
    if (res.error) toast.error(res.error);
    else toast.success(on ? "Hidden from visitors." : "Visible to visitors.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-2">
        <Label htmlFor="home-tree">Home tree</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={choice} onValueChange={(v) => setChoice(String(v ?? homeTreeId))}>
            <SelectTrigger id="home-tree" className="sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={onMove}
            disabled={busy || choice === homeTreeId || options.length < 2}
          >
            Move home
          </Button>
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
          checked={hiddenFromVisitors}
          disabled={busy}
          onCheckedChange={(on) => onHide(on === true)}
        />
        <Label htmlFor="hide-visitors" className="font-normal leading-snug">
          Hide my entry from visitors — people viewing a tree I&rsquo;m on
          from another tree see a blurred card with no name or details.
        </Label>
      </div>
    </div>
  );
}
