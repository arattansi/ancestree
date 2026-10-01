"use client";

import { creditTagClass, creditTagLinkClass } from "@/components/story-credit-tags";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A person a story is credited to (Step 99): a tag that opens a small card
 * saying what they are to the person the story is about, "Aalim Rattansi,
 * Great-grandson of Amarshi Sayani". With nothing to say (nothing on the
 * tree joins them, they aren't on it, or it's the story's own person) it's
 * a plain tag, with no card.
 */
export function StoryCreditTag({
  name,
  relation,
}: {
  name: string;
  /** "Great-grandson of Amarshi Sayani" (`relationText`), or null. */
  relation: string | null;
}) {
  if (!relation) return <span className={creditTagClass}>{name}</span>;
  return (
    <Popover>
      <PopoverTrigger className={creditTagLinkClass}>{name}</PopoverTrigger>
      <PopoverContent className="w-auto max-w-72">
        <p>
          <span className="font-medium">{name}</span>, {relation}
        </p>
      </PopoverContent>
    </Popover>
  );
}
