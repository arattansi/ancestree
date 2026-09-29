"use client";

import * as React from "react";
import { Maximize2 } from "lucide-react";

import { SPOTLIGHT_BROWN } from "@/components/tree/spotlight-colours";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BASIC_DETAILS } from "@/lib/carry";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import {
  maidenLine,
  personDisplayName,
  personInitials,
  personLifespan,
} from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";

/**
 * A person's details, minimized (Step 49). The sheet covers the right of the
 * canvas, and most of it on a phone, so it can be put away while the reader
 * looks at the tree it belongs to. This card is what's left of it, the
 * sheet's own heading: whose details are open. Pressing it brings them back;
 * ✕ closes them. It takes the place of the "…'s tree" pill.
 */
export function FoldedDetails({
  person,
  isSelf,
  onExpand,
  onClose,
  expandRef,
}: {
  person: TreeGraphPerson;
  isSelf: boolean;
  onExpand: () => void;
  onClose: () => void;
  expandRef: React.Ref<HTMLButtonElement>;
}) {
  const name = personDisplayName(person);
  const maiden = maidenLine(person);
  return (
    <div
      className="flex w-full items-center gap-1 rounded-2xl border bg-card p-1.5 text-sm shadow-md"
      style={{
        borderColor: `color-mix(in srgb, ${SPOTLIGHT_BROWN} 33%, transparent)`,
      }}
    >
      <button
        ref={expandRef}
        type="button"
        onClick={onExpand}
        aria-label={`Show ${name}’s details`}
        title="Show details"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Avatar className="size-9 overflow-hidden">
          {person.photo_url ? (
            <AvatarImage
              src={person.photo_url}
              alt=""
              style={cropStyle(parseCrop(person.photo_crop))}
            />
          ) : null}
          <AvatarFallback className="text-xs">
            {personInitials(person)}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-foreground">{name}</span>
          {maiden ? (
            <span className="truncate text-xs text-muted-foreground">
              {maiden}
            </span>
          ) : null}
          <span className="truncate text-xs text-muted-foreground">
            {person.basic
              ? BASIC_DETAILS
              : (personLifespan(person) ?? "Living")}
            {isSelf ? " · Your entry" : ""}
          </span>
        </span>
        <Maximize2
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="relative tap-target flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
