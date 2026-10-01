import type * as React from "react";

import { badgeVariants } from "@/components/ui/badge";
import { creditGroups, type StoryCredit } from "@/lib/story-credits";
import { cn } from "@/lib/utils";

/** A credited person's tag. */
export const creditTagClass = badgeVariants({ variant: "outline" });

/** A credited person's tag that opens a card about them. */
export const creditTagLinkClass = cn(
  creditTagClass,
  "relative tap-target cursor-pointer overflow-visible hover:bg-muted hover:text-muted-foreground",
);

/**
 * Who a story is credited to (Step 99), a line a role, storytellers first:
 * "Storyteller [Nan] · Interviewers [Raiya] [Dada]". Each person is a tag,
 * drawn by `tag` (`StoryCreditTag`: a card saying what they are to the
 * person the story is about). Nothing when nobody is credited.
 */
export function StoryCreditTags({
  credits,
  tag,
  className,
}: {
  credits: StoryCredit[];
  tag: (person: { id: string; name: string }) => React.ReactNode;
  className?: string;
}) {
  const groups = creditGroups(credits);
  if (groups.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      {groups.map((g) => (
        <div key={g.role} className="flex flex-wrap items-center gap-1.5">
          <span>{g.label}</span>
          {g.people.map((p) => (
            <span key={p.id} className="contents">
              {tag(p)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
