"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  petYears,
  speciesLabel,
  SPECIES_GLYPHS,
  type PetSpecies,
} from "@/lib/pet-schema";
import type { TreePet } from "@/lib/pets";

/**
 * The pets this person lived with.
 *
 * Kept apart from `FamilySection` on purpose: companions are listed *after*
 * the family, in their own section, with their own wording — never as another
 * kind of relative in the same list.
 */
export function CompanionsSection({
  pets,
  canAdd,
  onSelectPet,
  onAdd,
}: {
  pets: TreePet[];
  canAdd: boolean;
  onSelectPet: (petId: string) => void;
  onAdd: () => void;
}) {
  if (pets.length === 0 && !canAdd) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">Companions</h2>
      {pets.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {pets.map((pet) => (
            <li key={pet.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => onSelectPet(pet.id)}
              >
                <span aria-hidden>
                  {SPECIES_GLYPHS[pet.species as PetSpecies] ??
                    SPECIES_GLYPHS.other}
                </span>
                <span className="min-w-0 flex-1 truncate">{pet.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {speciesLabel(pet)}
                  {petYears(pet) ? ` · ${petYears(pet)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No pets on this entry yet.
        </p>
      )}
      {canAdd ? (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={onAdd}
        >
          Add a companion
        </Button>
      ) : null}
    </section>
  );
}
