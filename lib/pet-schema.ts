import { z } from "zod";

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

/** Earliest year a pet can be given; anything older is a typo, not a pet. */
export const MIN_PET_YEAR = 1900;

/**
 * Years are held as text in the form (an empty input is "" rather than NaN)
 * and converted on the way to the row, so the schema's input and output types
 * stay the same shape and react-hook-form can drive it directly.
 */
const optionalYear = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Use a 4-digit year.")
  .optional()
  .or(z.literal(""));

/** "1998" -> 1998, "" -> null. */
export const yearNumber = (value: string | undefined): number | null => {
  const n = Number((value ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
};

const inRange = (value: string | undefined) => {
  const n = yearNumber(value);
  return n === null || (n >= MIN_PET_YEAR && n <= new Date().getFullYear());
};

/**
 * Everything a companion is: a name, a species, roughly when it was around,
 * and whether it is still with the family. No places, no lineage, no dates to
 * the day — a pet entry should take fifteen seconds, not fifteen fields.
 */
export const petSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give them a name.")
      .max(80, "Keep this under 80 characters."),
    species: z.enum(PET_SPECIES),
    species_label: z
      .string()
      .trim()
      .max(40, "Keep this under 40 characters.")
      .optional()
      .or(z.literal("")),
    year_born: optionalYear,
    is_deceased: z.boolean(),
    year_died: optionalYear,
  })
  .refine((v) => v.species !== "other" || Boolean(v.species_label?.trim()), {
    message: "Say what kind of animal this is.",
    path: ["species_label"],
  })
  .refine((v) => inRange(v.year_born), {
    message: `Use a year between ${MIN_PET_YEAR} and now.`,
    path: ["year_born"],
  })
  .refine((v) => inRange(v.year_died), {
    message: `Use a year between ${MIN_PET_YEAR} and now.`,
    path: ["year_died"],
  })
  .refine(
    (v) => {
      const born = yearNumber(v.year_born);
      const died = yearNumber(v.year_died);
      return born === null || died === null || died >= born;
    },
    { message: "That's before the year they were born.", path: ["year_died"] },
  );

export type PetFormValues = z.infer<typeof petSchema>;

/** A blank companion form: the common case is a living cat or dog. */
export const emptyPetValues: PetFormValues = {
  name: "",
  species: "dog",
  species_label: "",
  year_born: "",
  is_deceased: false,
  year_died: "",
};

/** Form values → row columns, with the fields the DB checks would reject dropped. */
export function toPetPayload(values: PetFormValues) {
  return {
    name: values.name.trim(),
    species: values.species,
    species_label:
      values.species === "other" ? values.species_label?.trim() || null : null,
    year_born: yearNumber(values.year_born),
    is_deceased: values.is_deceased,
    year_died: values.is_deceased ? yearNumber(values.year_died) : null,
  };
}

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
