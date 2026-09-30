/**
 * What a companion is called and how its dates read, apart from the form's
 * schema (Step 87.4, audit C1): the canvas chip and the details sheets show
 * them, and importing them from `pet-schema` brought zod with them.
 */

import { formatPartialDate } from "@/lib/partial-date";

/**
 * Cats and dogs are first-class; anything else is `other` plus a short label,
 * so "Nibbles the rabbit" is possible without opening a species taxonomy.
 */
export const PET_SPECIES = ["cat", "dog", "other"] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export const SPECIES_LABELS: Record<PetSpecies, string> = {
  cat: "Cat",
  dog: "Dog",
  other: "Other",
};

/** The glyph on the canvas chip — a companion never wears a person's avatar. */
export const SPECIES_GLYPHS: Record<PetSpecies, string> = {
  cat: "🐈",
  dog: "🐕",
  other: "🐾",
};

/** "Cat" / "Rabbit" — what the chip and the panel call this animal. */
export function speciesLabel(pet: {
  species: string;
  species_label: string | null;
}): string {
  if (pet.species === "other") {
    return pet.species_label?.trim() || "Companion";
  }
  return SPECIES_LABELS[pet.species as PetSpecies] ?? "Companion";
}

/** "2009 – 2021" / "b. 2018" / null — the one line of dates a pet ever shows. */
export function petYears(pet: {
  year_born: number | null;
  year_died: number | null;
  is_deceased: boolean;
}): string | null {
  if (pet.is_deceased) {
    if (pet.year_born && pet.year_died)
      return `${pet.year_born} – ${pet.year_died}`;
    if (pet.year_died) return `d. ${pet.year_died}`;
    if (pet.year_born) return `b. ${pet.year_born}`;
    return "In memory";
  }
  return pet.year_born ? `b. ${pet.year_born}` : null;
}

/** "Nairobi, Kenya" from the denormalised place pair — same as a person entry. */
export function petBirthplace(pet: {
  city_of_birth: string | null;
  country_of_birth: string | null;
}): string | null {
  return (
    [pet.city_of_birth, pet.country_of_birth].filter(Boolean).join(", ") || null
  );
}

/**
 * "14 March 2018" from an ISO date, for the panel's details row: spelled
 * out as a person's dates are, the same in every browser (Step 77.4).
 */
export function formatPetBirthday(birthDate: string | null): string | null {
  return formatPartialDate(birthDate, "day");
}
