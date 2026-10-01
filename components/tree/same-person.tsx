"use client";

import { toast } from "sonner";

import { TreeMarkDot, type CardMark } from "@/components/tree/tree-mark";
import { Button } from "@/components/ui/button";
import { refocusAfterRemoval } from "@/components/use-focus-return";
import { cn } from "@/lib/utils";

/** Another card a card may be the same person as, as the sheet names it. */
export type SameAsCard = {
  id: string;
  /** Their name, or "you" for the viewer's own entry. */
  name: string;
  /** The tree their card comes from, as its mark shows it. */
  mark: CardMark | null;
};

/** "Same person as Fatima Rattansi?" — or "… as Fatima or Zahra?". */
export function samePersonLabel(names: readonly string[]): string {
  const list =
    names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `Same person as ${list}?`;
}

/**
 * The flag on a card of My Family Tree that may be the same person as
 * another (Step 92.4): a "?" in the attention colour, at the card's foot
 * across from the account mark. The card opens the sheet, which asks.
 */
export function SamePersonMark({
  label,
  className,
}: {
  /** What it asks, for anyone who can't see it; without one it's
   *  decoration beside the words. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      {...(label
        ? { role: "img", "aria-label": label, title: label }
        : { "aria-hidden": true })}
      className={cn(
        "flex size-4 items-center justify-center rounded-full bg-attention text-[10px] leading-none font-semibold text-attention-foreground",
        className,
      )}
    >
      ?
    </span>
  );
}

/**
 * What a person's sheet asks on My Family Tree when their card may be
 * someone else's too (Step 92.4): "Same person as …?", the other card's
 * name opening it, so the two can be looked at in turn. **Not the same**
 * puts the question away in this browser, with Undo in its toast. Seen by
 * the viewer only; merging the two is a later step.
 */
export function SamePersonPrompt({
  others,
  onOpen,
  onNotSame,
}: {
  others: readonly SameAsCard[];
  onOpen: (personId: string) => void;
  /** Says they're two people, or with `false` takes that back. */
  onNotSame: (personId: string, notSame: boolean) => void;
}) {
  if (others.length === 0) return null;
  return (
    <ul
      aria-label="Same person?"
      className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
    >
      {others.map((other) => (
        <li key={other.id} className="flex items-start gap-2">
          <SamePersonMark className="mt-0.5 shrink-0" />
          {/* The question wraps as a sentence; the button goes under it
              when the two don't fit on a line. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="min-w-0">
              Same person as{" "}
              <button
                type="button"
                className="relative tap-target text-foreground underline underline-offset-2"
                onClick={() => onOpen(other.id)}
              >
                {other.mark ? (
                  <TreeMarkDot
                    mark={other.mark}
                    className="mr-1.5 align-[-0.05em]"
                  />
                ) : null}
                {other.name}
                {other.mark ? (
                  <span className="sr-only">, from {other.mark.name}</span>
                ) : null}
              </button>
              ?
            </p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-label={`Not the same as ${other.name}`}
              onClick={(event) => {
                refocusAfterRemoval(event.currentTarget);
                onNotSame(other.id, true);
                toast("Marked as two people.", {
                  action: {
                    label: "Undo",
                    onClick: () => onNotSame(other.id, false),
                  },
                });
              }}
            >
              Not the same
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
