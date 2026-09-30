import { z } from "zod";

import { PET_SPECIES } from "@/lib/pet-labels";

export {
  formatPetBirthday,
  PET_SPECIES,
  petBirthplace,
  petYears,
  speciesLabel,
  SPECIES_GLYPHS,
  SPECIES_LABELS,
  type PetSpecies,
} from "@/lib/pet-labels";

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

/** A full ISO date from the date picker, or "" — nobody is made to give one. */
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.")
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
    birth_date: optionalDate,
    // The same GeoNames-backed place a person entry uses — a real `places.id`
    // plus the denormalised text pair — but optional, where a person's is not.
    place_id_birth: z.number().int().positive().nullable(),
    city_of_birth: z
      .string()
      .trim()
      .max(120, "Keep this under 120 characters.")
      .optional()
      .or(z.literal("")),
    country_of_birth: z
      .string()
      .trim()
      .max(120, "Keep this under 120 characters.")
      .optional()
      .or(z.literal("")),
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
  )
  .refine(
    (v) => {
      if (!v.birth_date) return true;
      const year = Number(v.birth_date.slice(0, 4));
      return year >= MIN_PET_YEAR && year <= new Date().getFullYear();
    },
    {
      message: `Use a date between ${MIN_PET_YEAR} and now.`,
      path: ["birth_date"],
    },
  )
  .refine(
    (v) => {
      const year = yearNumber(v.year_born);
      if (!v.birth_date || year === null) return true;
      return Number(v.birth_date.slice(0, 4)) === year;
    },
    {
      message: "This doesn't match the year born above.",
      path: ["birth_date"],
    },
  );

export type PetFormValues = z.infer<typeof petSchema>;

/** A blank companion form: the common case is a living cat or dog. */
export const emptyPetValues: PetFormValues = {
  name: "",
  species: "dog",
  species_label: "",
  year_born: "",
  birth_date: "",
  place_id_birth: null,
  city_of_birth: "",
  country_of_birth: "",
  is_deceased: false,
  year_died: "",
};

/** Form values → row columns, with the fields the DB checks would reject dropped. */
export function toPetPayload(values: PetFormValues) {
  const birthDate = (values.birth_date ?? "").trim() || null;
  // An exact date always implies its year, so the chip never has to guess.
  const yearBorn = birthDate
    ? Number(birthDate.slice(0, 4))
    : yearNumber(values.year_born);
  return {
    name: values.name.trim(),
    species: values.species,
    species_label:
      values.species === "other" ? values.species_label?.trim() || null : null,
    year_born: yearBorn,
    birth_date: birthDate,
    place_id_birth: values.place_id_birth ?? null,
    city_of_birth: (values.city_of_birth ?? "").trim() || null,
    country_of_birth: (values.country_of_birth ?? "").trim() || null,
    is_deceased: values.is_deceased,
    year_died: values.is_deceased ? yearNumber(values.year_died) : null,
  };
}
