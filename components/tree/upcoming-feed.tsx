"use client";

import * as React from "react";
import { Cake, Heart, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FitText } from "@/components/ui/fit-text";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import {
  groupOccasions,
  occasionDay,
  occasionTitle,
  WEEK_DAYS,
  type Occasion,
} from "@/lib/occasions";
import { personDisplayName, personInitials } from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";
import { cn } from "@/lib/utils";

type Props = {
  /** What's coming up among the people the canvas draws; null until the
   *  browser knows what day it is (`useToday`). */
  occasions: Occasion[] | null;
  today: string | null;
  personById: ReadonlyMap<string, TreeGraphPerson>;
  /** Something is narrowing the canvas, so the list is narrowed with it. */
  filtered: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open someone's details, as a search result does. */
  onPickPerson: (personId: string) => void;
  /** Light the line between a couple, as "Show a connection" does. */
  onPickCouple: (a: string, b: string) => void;
};

function Face({
  person,
  className,
}: {
  person: TreeGraphPerson | undefined;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-7 overflow-hidden", className)}>
      {person?.photo_url ? (
        <AvatarImage
          src={person.photo_url}
          alt=""
          style={cropStyle(parseCrop(person.photo_crop))}
        />
      ) : null}
      <AvatarFallback className="text-[10px]">
        {person ? personInitials(person) : "?"}
      </AvatarFallback>
    </Avatar>
  );
}

/** "Ahmed & Sara Khan" when they share a surname, else both in full. */
function coupleName(
  a: TreeGraphPerson | undefined,
  b: TreeGraphPerson | undefined,
): string {
  const first = (p: TreeGraphPerson) =>
    (p.preferred_name || p.first_name || "").trim();
  if (a && b && a.last_name === b.last_name && first(a) && first(b))
    return `${first(a)} & ${first(b)} ${a.last_name}`;
  return [a, b]
    .filter((p): p is TreeGraphPerson => !!p)
    .map(personDisplayName)
    .join(" & ");
}

/** When it is: "today", "tomorrow", or " · Sat 3 Oct". */
function when(o: Occasion): string {
  if (o.daysAway === 0) return " today";
  if (o.daysAway === 1) return " tomorrow";
  return ` · ${occasionDay(o.date)}`;
}

/**
 * Birthdays and wedding anniversaries coming up over the next year (Step
 * 57.1), at the canvas's top left under who's here (Step 60). It lists only
 * the people the canvas is drawing, and of those only who a search leaves
 * lit, so switching on "Show only your side" or "Only descendants of"
 * narrows it too; a chip says so.
 * Closed, the button counts the week ahead. A birthday opens that person's
 * details; an anniversary lights the couple's line.
 */
export function UpcomingFeed({
  occasions,
  today,
  personById,
  filtered,
  open,
  onOpenChange,
  onPickPerson,
  onPickCouple,
}: Props) {
  const thisWeek = occasions?.filter((o) => o.daysAway < WEEK_DAYS).length ?? 0;
  const groups = React.useMemo(
    () => (occasions && today ? groupOccasions(occasions, today) : []),
    [occasions, today],
  );

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => onOpenChange(true)}
        className="gap-1.5 bg-card shadow-md"
        aria-label="Upcoming birthdays and anniversaries"
        aria-expanded={false}
      >
        <Cake />
        <span className="hidden sm:inline">Upcoming</span>
        {thisWeek > 0 ? (
          <span
            className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] leading-none font-semibold text-primary-foreground"
            aria-label={`${thisWeek} this week`}
          >
            {thisWeek}
          </span>
        ) : null}
      </Button>
    );
  }

  return (
    <div className="relative z-10 flex max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] max-w-72 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-md sm:w-72">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Cake className="size-3.5 text-muted-foreground" />
          Upcoming
          {filtered ? (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] leading-none font-normal text-accent-foreground">
              Filtered
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close upcoming"
        >
          <X className="size-4" />
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No birthdays or anniversaries coming up.
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            className="flex flex-col gap-1 border-t border-border pt-2"
          >
            <h3 className="text-xs font-medium text-muted-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((o) => {
                const [a, b] = o.people.map((id) => personById.get(id));
                const couple = o.kind === "anniversary";
                return (
                  <li key={`${o.kind}:${o.people.join("~")}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (couple) onPickCouple(o.people[0], o.people[1]);
                        else onPickPerson(o.people[0]);
                        onOpenChange(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent"
                    >
                      {couple ? (
                        <span className="flex shrink-0 -space-x-1.5">
                          <Face person={a} className="ring-2 ring-card" />
                          <Face person={b} className="ring-2 ring-card" />
                        </span>
                      ) : (
                        <Face person={a} className="shrink-0" />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <FitText
                          max={14}
                          min={11}
                          className="leading-5 font-medium"
                        >
                          {couple
                            ? coupleName(a, b)
                            : a
                              ? personDisplayName(a)
                              : ""}
                        </FitText>
                        <span className="flex items-center gap-1 text-xs leading-4 text-muted-foreground">
                          {couple ? (
                            <Heart aria-hidden className="size-3 shrink-0" />
                          ) : (
                            <Cake aria-hidden className="size-3 shrink-0" />
                          )}
                          <span className="truncate">
                            {occasionTitle(o)}
                            {when(o)}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
