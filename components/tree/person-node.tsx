"use client";

import * as React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  personDisplayName,
  personInitials,
  personLifespan,
} from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";

export type PersonNodeData = {
  person: TreeGraphPerson;
  isSelf: boolean;
  selected?: boolean;
};

const handleClass = "!size-1.5 !border-0 !bg-border";

function PersonNodeImpl({ data }: NodeProps) {
  const { person, isSelf, selected } = data as PersonNodeData;
  const name = personDisplayName(person);
  const lifespan = personLifespan(person);
  const deceased = person.is_deceased;

  return (
    <div
      className={cn(
        "relative flex w-52 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition-colors",
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
        <p className="truncate text-xs text-muted-foreground">
          {isSelf ? "You" : person.family_name}
          {lifespan ? ` · ${lifespan}` : ""}
        </p>
      </div>
    </div>
  );
}

export const PersonNode = React.memo(PersonNodeImpl);
