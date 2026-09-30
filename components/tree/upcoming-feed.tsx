"use client";

import * as React from "react";
import { Cake, Heart, Share, X } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { copyText } from "@/components/copy-text";
import { useSteadyPhoto } from "@/components/tree/use-steady-photo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FitText } from "@/components/ui/fit-text";
import { useFocusReturn } from "@/components/use-focus-return";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import {
  groupOccasions,
  occasionDay,
  occasionTitle,
  WEEK_DAYS,
  weekMessage,
  type Occasion,
} from "@/lib/occasions";
import {
  maidenLine,
  personDisplayName,
  personInitials,
} from "@/lib/person-name";
import { hasMessagesApp, messagesHref, whatsappHref } from "@/lib/share-text";
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
  const photo = useSteadyPhoto(person?.photo_card_url ?? null);
  return (
    <Avatar className={cn("size-7 overflow-hidden", className)}>
      {person && photo ? (
        <AvatarImage
          src={photo}
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

const firstName = (p: TreeGraphPerson) =>
  (p.preferred_name || p.first_name || "").trim();

/** "Ahmed & Sara Khan" when they share a surname, else both in full. */
function coupleName(
  a: TreeGraphPerson | undefined,
  b: TreeGraphPerson | undefined,
): string {
  if (a && b && a.last_name === b.last_name && firstName(a) && firstName(b))
    return `${firstName(a)} & ${firstName(b)} ${a.last_name}`;
  return [a, b]
    .filter((p): p is TreeGraphPerson => !!p)
    .map(personDisplayName)
    .join(" & ");
}

/**
 * The line under a row's name: "née Jaffer" under someone's own, and under
 * a couple's, whose it is: "Sara née Jaffer".
 */
function maidenNote(
  a: TreeGraphPerson | undefined,
  b: TreeGraphPerson | undefined,
  couple: boolean,
): string | null {
  if (!couple) return a ? maidenLine(a) : null;
  const notes = [a, b].flatMap((p) => {
    const maiden = p ? maidenLine(p) : null;
    if (!p || !maiden) return [];
    return [firstName(p) ? `${firstName(p)} ${maiden}` : maiden];
  });
  return notes.join(" · ") || null;
}

/**
 * Upcoming's **Share** (Step 89): the week ahead, typed out for a family
 * chat and sent by the member, not by us. WhatsApp and Messages open with
 * the text ready and the member picks the chat; Copy is for anywhere else
 * (Slack, say); More… is the device's own share sheet, where it has one.
 * Messages shows only where an `sms:` link opens it (Apple, Android).
 */
function ShareWeek({ text }: { text: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground outline-none tap-target hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Share this week"
      >
        <Share className="size-3.5" />
        Share
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <ShareItems text={text} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The menu's items, drawn only once it opens, so `navigator` is there. */
function ShareItems({ text }: { text: string }) {
  const messages = hasMessagesApp(navigator.userAgent);
  const sheet = typeof navigator.share === "function";
  return (
    <>
      <DropdownMenuItem
        render={
          <a href={whatsappHref(text)} target="_blank" rel="noopener noreferrer" />
        }
      >
        WhatsApp
      </DropdownMenuItem>
      {messages ? (
        <DropdownMenuItem render={<a href={messagesHref(text)} />}>
          Messages
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        onClick={() =>
          void copyText(text, { copied: "Copied", failed: "Couldn't copy" })
        }
      >
        Copy
      </DropdownMenuItem>
      {sheet ? (
        <DropdownMenuItem
          // Closing the sheet without sharing rejects; that's no error.
          onClick={() => void navigator.share({ text }).catch(() => {})}
        >
          More…
        </DropdownMenuItem>
      ) : null}
    </>
  );
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
  const shareText = React.useMemo(
    () =>
      weekMessage(occasions ?? [], (o) => {
        const [a, b] = o.people.map((id) => personById.get(id));
        return o.kind === "anniversary"
          ? coupleName(a, b)
          : a
            ? personDisplayName(a)
            : "";
      }),
    [occasions, personById],
  );

  // The button and the card take each other's place, so focus is handed
  // across (Step 70): to the card's ✕ as it opens, and back to the button as
  // the card closes itself.
  const returnFocus = useFocusReturn();
  const openRef = React.useRef<HTMLButtonElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const closeCard = () => {
    returnFocus(() => openRef.current);
    onOpenChange(false);
  };

  if (!open) {
    return (
      <Button
        ref={openRef}
        size="sm"
        variant="outline"
        onClick={() => {
          returnFocus(() => closeRef.current);
          onOpenChange(true);
        }}
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
    // On a touch screen the ✕'s hit area reaches past the card's padding; it
    // mustn't make the card scroll sideways.
    <div className="relative z-10 flex max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] max-w-72 flex-col gap-3 overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-md sm:w-72">
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
        <div className="flex items-center gap-2">
          {shareText ? <ShareWeek text={shareText} /> : null}
          <button
            ref={closeRef}
            type="button"
            onClick={closeCard}
            className="relative tap-target text-muted-foreground hover:text-foreground"
            aria-label="Close upcoming"
          >
            <X className="size-4" />
          </button>
        </div>
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
                const maiden = maidenNote(a, b, couple);
                return (
                  <li key={`${o.kind}:${o.people.join("~")}`}>
                    <button
                      type="button"
                      onClick={() => {
                        // Someone's details take focus as they open; a
                        // couple's line has nothing to take it, so the
                        // button does.
                        if (couple) {
                          onPickCouple(o.people[0], o.people[1]);
                          closeCard();
                        } else {
                          onPickPerson(o.people[0]);
                          onOpenChange(false);
                        }
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
                        {maiden ? (
                          <FitText className="leading-4 text-muted-foreground">
                            {maiden}
                          </FitText>
                        ) : null}
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
