import { z } from "zod";

/** Lineage is admin-only and relative to a parent edge; see Step 5. */
export const LINEAGE_TYPES = ["biological", "adoptive", "unknown"] as const;
export type LineageType = (typeof LINEAGE_TYPES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .or(z.literal(""));

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.")
  .optional()
  .or(z.literal(""));

/**
 * Shared person schema. Required: (first OR preferred) AND last name AND
 * country of birth AND an explicit living/deceased answer. Death fields only
 * apply when `is_deceased` is true.
 */
export const personSchema = z
  .object({
    first_name: optionalText(120),
    middle_name: optionalText(120),
    preferred_name: optionalText(120),
    maiden_name: optionalText(120),
    last_name: z
      .string()
      .trim()
      .min(1, "Last name is required.")
      .max(120, "Keep this under 120 characters."),
    date_of_birth: optionalDate,
    city_of_birth: optionalText(120),
    country_of_birth: z
      .string()
      .trim()
      .min(1, "Country of birth is required.")
      .max(120, "Keep this under 120 characters."),
    is_deceased: z.boolean(),
    date_of_death: optionalDate,
    place_of_death: optionalText(160),
    lineage_type: z.enum(LINEAGE_TYPES).optional(),
  })
  .refine((v) => Boolean(v.first_name?.trim() || v.preferred_name?.trim()), {
    message: "Enter a first name or a preferred name.",
    path: ["first_name"],
  })
  .refine(
    (v) =>
      !(
        v.is_deceased &&
        v.date_of_birth &&
        v.date_of_death &&
        v.date_of_death < v.date_of_birth
      ),
    {
      message: "Date of death can't be before the date of birth.",
      path: ["date_of_death"],
    },
  );

export type PersonFormValues = z.infer<typeof personSchema>;

export const emptyPersonValues: PersonFormValues = {
  first_name: "",
  middle_name: "",
  preferred_name: "",
  maiden_name: "",
  last_name: "",
  date_of_birth: "",
  city_of_birth: "",
  country_of_birth: "",
  is_deceased: false,
  date_of_death: "",
  place_of_death: "",
  lineage_type: undefined,
};

function trimOrNull(s?: string): string | null {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : null;
}

/** Normalise validated form values into the shape the DB writers expect. */
export function toPersonPayload(values: PersonFormValues) {
  return {
    first_name: trimOrNull(values.first_name),
    middle_name: trimOrNull(values.middle_name),
    preferred_name: trimOrNull(values.preferred_name),
    maiden_name: trimOrNull(values.maiden_name),
    last_name: values.last_name.trim(),
    date_of_birth: trimOrNull(values.date_of_birth),
    city_of_birth: trimOrNull(values.city_of_birth),
    country_of_birth: values.country_of_birth.trim(),
    is_deceased: values.is_deceased,
    date_of_death: values.is_deceased ? trimOrNull(values.date_of_death) : null,
    place_of_death: values.is_deceased ? trimOrNull(values.place_of_death) : null,
    lineage_type: values.lineage_type ?? null,
  };
}
