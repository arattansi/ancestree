"use client";

import * as React from "react";

import { setNewsletterOpens } from "@/app/actions/newsletter";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";

/**
 * Whether the newsletter counts when they open it (Step 226): off unless
 * they tick it, here or from the newsletter's own page. Only a count of how
 * many open it, never who.
 */
export function WeeklyNewsletterOpens({ on }: { on: boolean }) {
  const action = useAction();
  // Ticks at once, and goes back by itself if the save doesn't work.
  const [checked, setChecked] = React.useOptimistic(on);

  return (
    <div id="newsletter-opens" className="flex scroll-mt-24 items-center gap-3">
      <Checkbox
        id="weekly-newsletter-opens"
        checked={checked}
        onCheckedChange={(value) =>
          action.run("save", async () => {
            setChecked(value === true);
            return setNewsletterOpens(value === true);
          })
        }
      />
      <Label
        htmlFor="weekly-newsletter-opens"
        className="font-normal leading-snug text-foreground"
      >
        Count when I open the newsletter
      </Label>
    </div>
  );
}
