"use client";

import * as React from "react";

import { setRelativesCanAsk } from "@/app/actions/invite-relays";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { RELATIVES_CAN_ASK_LABEL } from "@/lib/invite-relays";

/**
 * Whether a newcomer's ask for an invite can reach this member (Step 41.5,
 * `profiles.relatives_can_ask`). On unless they untick it. Off, nothing
 * reaches them, and the newcomer is told what everyone is told, so it never
 * shows who has turned it off.
 */
export function RelativesCanAsk({ on }: { on: boolean }) {
  const action = useAction();
  // Ticks at once, and goes back by itself if the save doesn't work.
  const [checked, setChecked] = React.useOptimistic(on);

  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="relatives-can-ask"
        checked={checked}
        onCheckedChange={(value) =>
          action.run("save", async () => {
            setChecked(value === true);
            return setRelativesCanAsk(value === true);
          })
        }
        aria-describedby="relatives-can-ask-note"
      />
      <div className="flex flex-col gap-1">
        <Label
          htmlFor="relatives-can-ask"
          className="font-normal leading-snug text-foreground"
        >
          {RELATIVES_CAN_ASK_LABEL}
        </Label>
        <p id="relatives-can-ask-note" className="text-xs">
          Someone who can&rsquo;t find themselves on a tree can give us your
          address, and we pass their name and email on to you. Untick this and
          nothing reaches you. They&rsquo;re told the same either way.
        </p>
      </div>
    </div>
  );
}
