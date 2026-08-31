"use client";

import * as React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { personDisplayName, personInitials } from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";

export type PersonNodeData = {
  person: TreeGraphPerson;
  isSelf: boolean;
  selected?: boolean;
  /** Filtered out by the tree search panel — shown faded. */
  dimmed?: boolean;
};

const handleClass = "!size-1.5 !border-0 !bg-border";

function PersonNodeImpl({ data }: NodeProps) {
  const { person, isSelf, selected, dimmed } = data as PersonNodeData;
  const name = personDisplayName(person);
  const deceased = person.is_deceased;
  const birthYear = person.date_of_birth?.slice(0, 4) ?? null;
  const birthplace = person.city_of_birth || person.country_of_birth || null;
  // e.g. "b. 1995, Burnaby"
  const born = [birthYear && `b. ${birthYear}`, birthplace]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={cn("group relative", dimmed && "opacity-25")}>
      {person.photo_url ? (
        // On hover the card "grows": a larger copy of the card anchored to the
        // same centre, with a big photo above the name so the name stays visible.
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 left-1/2 z-50 hidden w-56 -translate-x-1/2",
            "flex-col overflow-hidden rounded-xl border bg-card shadow-xl group-hover:flex",
            deceased ? "border-dashed border-border" : "border-border",
          )}
        >
          <img
            src={person.photo_url}
            alt={`Photo of ${name}`}
            className="aspect-square w-full object-cover"
          />
          <div className="flex flex-col gap-0.5 px-3 py-2">
            <p
              className={cn(
                "truncate text-sm font-medium",
                deceased ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {name}
            </p>
            {born ? (
              <p className="truncate text-xs text-muted-foreground">{born}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          // Fixed height (matching NODE_H) so every card is identical: the
          // left/right handles sit at each card's own centre, so cards of
          // differing heights would tilt the spouse line between them.
          "relative flex h-24 w-52 items-center gap-3 overflow-hidden rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-[colors,opacity]",
          "hover:border-ring/60",
          deceased ? "border-dashed border-border" : "border-border",
          selected && "border-ring ring-2 ring-ring/40",
          isSelf && !selected && "border-primary/60",
        )}
      >
      <Handle type="target" position={Position.Top} className={handleClass} />
      <Handle
        type="target"
        position={Position.Left}
        id="l"
        className={handleClass}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="r"
        className={handleClass}
      />
      <Handle type="source" position={Position.Bottom} className={handleClass} />

      {person.open_flag_count > 0 ? (
        <span
          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white"
          title={`${person.open_flag_count} open flag${person.open_flag_count === 1 ? "" : "s"}`}
          aria-label={`${person.open_flag_count} open flags`}
        >
          {person.open_flag_count}
        </span>
      ) : null}

      <Avatar size="lg" className={cn(deceased && "opacity-70")}>
        {person.photo_url ? (
          <AvatarImage src={person.photo_url} alt="" />
        ) : null}
        <AvatarFallback>{personInitials(person)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "flex items-center gap-1 truncate text-sm font-medium",
            deceased ? "text-muted-foreground" : "text-foreground",
          )}
          title={name}
        >
          <span className="truncate">{name}</span>
          {person.verified_at ? (
            <span
              className="shrink-0 text-primary"
              title="Verified by an admin"
              aria-label="Verified"
            >
              ✓
            </span>
          ) : null}
        </p>
        {isSelf ? (
          <p className="truncate text-xs font-medium text-primary">You</p>
        ) : null}
        {person.maiden_name ? (
          <p
            className="truncate text-xs text-muted-foreground"
            title={`née ${person.maiden_name}`}
          >
            née {person.maiden_name}
          </p>
        ) : null}
        {born ? (
          <p className="truncate text-xs text-muted-foreground" title={born}>
            {born}
          </p>
        ) : null}
      </div>
      </div>
    </div>
  );
}

export const PersonNode = React.memo(PersonNodeImpl);
