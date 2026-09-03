"use client";

import * as React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { cropStyle, parseCrop } from "@/lib/image-crop";
import {
  petYears,
  speciesLabel,
  SPECIES_GLYPHS,
  type PetSpecies,
} from "@/lib/pet-schema";
import type { TreePet } from "@/lib/pets";
import { cn } from "@/lib/utils";

export type PetNodeData = {
  pet: TreePet;
  selected?: boolean;
  /** Filtered out by the tree search panel — shown faded. */
  dimmed?: boolean;
};

const handleClass = "!size-1 !border-0 !bg-transparent";

/**
 * A companion chip.
 *
 * Everything about it is scaled down from a person card on purpose — it is a
 * third the height, a pill rather than a rectangle, and it leads with a species
 * glyph instead of an avatar — so at any zoom level it reads as "the family's
 * dog" and never as another relative in the row below.
 */
function PetNodeImpl({ data }: NodeProps) {
  const { pet, selected, dimmed } = data as PetNodeData;
  const years = petYears(pet);
  const kind = speciesLabel(pet);
  const glyph =
    SPECIES_GLYPHS[pet.species as PetSpecies] ?? SPECIES_GLYPHS.other;

  return (
    <div className={cn("group relative", dimmed && "opacity-25")}>
      {pet.photo_url ? (
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 left-1/2 z-50 hidden w-40 -translate-x-1/2",
            "flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl group-hover:flex",
          )}
        >
          <div className="aspect-square w-full overflow-hidden">
            <img
              src={pet.photo_url}
              alt={`Photo of ${pet.name}`}
              style={cropStyle(parseCrop(pet.photo_crop))}
              className="size-full"
            />
          </div>
          <div className="flex flex-col gap-0.5 px-3 py-2">
            <p className="truncate text-sm font-medium">{pet.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {kind}
              {years ? ` · ${years}` : ""}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          // h-11 / w-36 matches PET_H / PET_W in `pet-layout.ts`.
          "relative flex h-11 w-36 items-center gap-2 rounded-full border bg-muted/60 px-2 pr-3 text-left shadow-sm transition-[colors,opacity,box-shadow]",
          "border-border/70 hover:border-ring/60",
          pet.is_deceased && "opacity-75",
          selected && "border-ring ring-2 ring-ring/40",
        )}
        title={`${pet.name} — ${kind}${years ? `, ${years}` : ""}`}
      >
        <Handle type="target" position={Position.Top} className={handleClass} />

        <span
          className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background text-sm"
          aria-hidden
        >
          {pet.photo_url ? (
            <img
              src={pet.photo_url}
              alt=""
              style={cropStyle(parseCrop(pet.photo_crop))}
              className="size-full object-cover"
            />
          ) : (
            glyph
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-foreground">
            {pet.name}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {pet.is_deceased && !years ? "In memory" : (years ?? kind)}
          </span>
        </span>
      </div>
    </div>
  );
}

export const PetNode = React.memo(PetNodeImpl);
