import { z } from "zod";

/** Lineage is admin-only and relative to a parent edge; see Step 5. */
export const LINEAGE_TYPES = ["biological", "adoptive", "unknown"] as const;
export type LineageType = (typeof LINEAGE_TYPES)[number];

/** Optional self-reported sex. `undisclosed` = "Prefer not to disclose". */
export const SEX_VALUES = ["male", "female", "undisclosed"] as const;
export type Sex = (typeof SEX_VALUES)[number];

export const SEX_LABELS: Record<Sex, string> = {
  male: "Male",
  female: "Female",
  undisclosed: "Prefer not to disclose",
};

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
    // Canonical GeoNames place (Step 4.5c). `city_of_birth` / `country_of_birth`
    // are still written alongside it (derived from the picked place) until the
    // legacy text columns are dropped — see Step 4.5b.
    place_id_birth: z.number().int().positive().nullable(),
    city_of_birth: optionalText(120),
    country_of_birth: optionalText(120),
    is_deceased: z.boolean(),
    date_of_death: optionalDate,
    place_id_death: z.number().int().positive().nullable(),
    place_of_death: optionalText(160),
    sex: z.enum(SEX_VALUES).optional(),
    lineage_type: z.enum(LINEAGE_TYPES).optional(),
  })
  .refine((v) => Boolean(v.first_name?.trim() || v.preferred_name?.trim()), {
    message: "Enter a first name or a preferred name.",
    path: ["first_name"],
  })
  .refine((v) => v.place_id_birth != null, {
    message: "Choose a place of birth from the list.",
    path: ["place_id_birth"],
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
  place_id_birth: null,
  city_of_birth: "",
  country_of_birth: "",
  is_deceased: false,
  date_of_death: "",
  place_id_death: null,
  place_of_death: "",
  sex: undefined,
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
    place_id_birth: values.place_id_birth ?? null,
    city_of_birth: trimOrNull(values.city_of_birth),
    country_of_birth: (values.country_of_birth ?? "").trim(),
    is_deceased: values.is_deceased,
    date_of_death: values.is_deceased ? trimOrNull(values.date_of_death) : null,
    place_id_death: values.is_deceased ? values.place_id_death ?? null : null,
    place_of_death: values.is_deceased ? trimOrNull(values.place_of_death) : null,
    sex: values.sex ?? null,
    lineage_type: values.lineage_type ?? null,
  };
}
