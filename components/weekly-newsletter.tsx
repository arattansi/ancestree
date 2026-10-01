"use client";

import * as React from "react";

import { setWeeklyNewsletter } from "@/app/actions/newsletter";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";

/**
 * Whether they get the weekly newsletter (Step 95): on unless they untick
 * it, here or from the email's Unsubscribe link.
 */
export function WeeklyNewsletter({ on }: { on: boolean }) {
  const action = useAction();
  // Ticks at once, and goes back by itself if the save doesn't work.
  const [checked, setChecked] = React.useOptimistic(on);

  return (
    <div id="newsletter" className="flex scroll-mt-24 items-center gap-3">
      <Checkbox
        id="weekly-newsletter"
        checked={checked}
        onCheckedChange={(value) =>
          action.run("save", async () => {
            setChecked(value === true);
            return setWeeklyNewsletter(value === true);
          })
        }
      />
      <Label
        htmlFor="weekly-newsletter"
        className="font-normal leading-snug text-foreground"
      >
        Email me a weekly newsletter
      </Label>
    </div>
  );
}
