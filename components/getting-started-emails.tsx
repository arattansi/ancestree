"use client";

import * as React from "react";

import { setGettingStartedEmails } from "@/app/actions/getting-started";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";

/**
 * Whether they get the getting started emails (Step 151): on unless they
 * untick it, here or from an email's link. Apart from the newsletter's.
 */
export function GettingStartedEmails({ on }: { on: boolean }) {
  const action = useAction();
  // Ticks at once, and goes back by itself if the save doesn't work.
  const [checked, setChecked] = React.useOptimistic(on);

  return (
    <div id="getting-started" className="flex scroll-mt-24 items-center gap-3">
      <Checkbox
        id="getting-started-emails"
        checked={checked}
        onCheckedChange={(value) =>
          action.run("save", async () => {
            setChecked(value === true);
            return setGettingStartedEmails(value === true);
          })
        }
      />
      <Label
        htmlFor="getting-started-emails"
        className="font-normal leading-snug text-foreground"
      >
        Email me tips for getting started
      </Label>
    </div>
  );
}
