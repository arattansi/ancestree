import { z } from "zod";

import {
  asDayMonth,
  dateProblem,
  isBeforeAtSharedPrecision,
  splitDateParts,
  toPartialIso,
  toStoredDate,
} from "@/lib/partial-date";

/** Lineage is admin-only and relative to a parent edge; see Step 5. */
export const LINEAGE_TYPES = ["biological", "adoptive", "unknown"] as const;
export type LineageType = (typeof LINEAGE_TYPES)[number];

export const LINEAGE_LABELS: Record<LineageType, string> = {
  biological: "Biological",
  adoptive: "Adoptive",
  unknown: "Unknown",
};

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

// A birth or death date may be whole, a month and year, or just the year
// (Step 17), and a birth date a day and month without the year too, a
// birthday (Step 63); `DateField` holds it as `year-month-day` with empty
// parts while it's being typed, and `dateProblem` says what's still wrong.
const optionalDate = (allowNoYear: boolean) =>
  z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      const problem = dateProblem(value, { allowPartial: true, allowNoYear });
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    });

/** Circa is ticked but the date has no year to be rough about (Step 81). */
const circaWithoutYear = (circa: boolean | undefined, date: string | undefined) =>
  Boolean(circa) && !splitDateParts(date).year;

const CIRCA_NEEDS_A_YEAR = "Add the year, or untick circa.";

/**
 * Shared person schema. Required: (first OR preferred) AND last name AND an
 * explicit living/deceased answer. A place of birth is optional since Step 44
 * (the database's `people_required_identity` agrees). Death fields only apply
 * when `is_deceased` is true. Either date can be marked circa, a rough
 * estimate (Step 81), once it has a year.
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
    date_of_birth: optionalDate(true),
    date_of_birth_circa: z.boolean().optional(),
    // Canonical GeoNames place (Step 4.5c). `city_of_birth` / `country_of_birth`
    // are still written alongside it (derived from the picked place) until the
    // legacy text columns are dropped — see Step 4.5b.
    place_id_birth: z.number().int().positive().nullable(),
    city_of_birth: optionalText(120),
    country_of_birth: optionalText(120),
    is_deceased: z.boolean(),
    date_of_death: optionalDate(false),
    date_of_death_circa: z.boolean().optional(),
    place_id_death: z.number().int().positive().nullable(),
    place_of_death: optionalText(160),
    sex: z.enum(SEX_VALUES).optional(),
    lineage_type: z.enum(LINEAGE_TYPES).optional(),
    // Contact details live on the entry, shown to other members only when
    // the person chooses (`email_visible`); their own address is seeded from
    // the one they sign in with.
    email: z
      .string()
      .trim()
      .max(254, "Keep this under 254 characters.")
      .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
        message: "That doesn't look like an email address.",
      })
      .optional()
      .or(z.literal("")),
    email_visible: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.first_name?.trim() || v.preferred_name?.trim()), {
    message: "Enter a first name or a preferred name.",
    path: ["first_name"],
  })
  .refine((v) => !circaWithoutYear(v.date_of_birth_circa, v.date_of_birth), {
    message: CIRCA_NEEDS_A_YEAR,
    path: ["date_of_birth"],
  })
  .refine(
    (v) =>
      !(v.is_deceased && circaWithoutYear(v.date_of_death_circa, v.date_of_death)),
    { message: CIRCA_NEEDS_A_YEAR, path: ["date_of_death"] },
  )
  .refine(
    // Only as finely as the vaguer of the two is known: died "1990" is fine
    // for someone born in May 1990.
    (v) =>
      !(
        v.is_deceased &&
        isBeforeAtSharedPrecision(v.date_of_death, v.date_of_birth)
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
  date_of_birth_circa: false,
  place_id_birth: null,
  city_of_birth: "",
  country_of_birth: "",
  is_deceased: false,
  date_of_death: "",
  date_of_death_circa: false,
  place_id_death: null,
  place_of_death: "",
  sex: undefined,
  lineage_type: undefined,
  email: "",
  email_visible: false,
};

/** A stored entry, as far as its form goes (`tree_people` or `people`). */
export type PersonRow = {
  first_name: string | null;
  middle_name: string | null;
  preferred_name: string | null;
  maiden_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  date_of_birth_precision: string | null;
  birth_month: number | null;
  birth_day: number | null;
  /** A rough estimate (Step 81); left out where it isn't read. */
  date_of_birth_circa?: boolean | null;
  place_id_birth: number | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  is_deceased: boolean | null;
  date_of_death: string | null;
  date_of_death_precision: string | null;
  date_of_death_circa?: boolean | null;
  place_id_death: number | null;
  place_of_death: string | null;
  sex: string | null;
  lineage_type: string | null;
  email: string | null;
  email_visible: boolean | null;
};

/**
 * What a form opens with for a stored entry. A partial date opens as just
 * what's known ("1931", "1931-03", or a birthday with no year, "-03-05").
 */
export function personFormValues(row: PersonRow): PersonFormValues {
  return {
    first_name: row.first_name ?? "",
    middle_name: row.middle_name ?? "",
    preferred_name: row.preferred_name ?? "",
    maiden_name: row.maiden_name ?? "",
    last_name: row.last_name,
    date_of_birth: toPartialIso(
      row.date_of_birth,
      row.date_of_birth_precision ?? "day",
      asDayMonth(row.birth_month, row.birth_day),
    ),
    date_of_birth_circa: row.date_of_birth_circa ?? false,
    place_id_birth: row.place_id_birth ?? null,
    city_of_birth: row.city_of_birth ?? "",
    country_of_birth: row.country_of_birth ?? "",
    is_deceased: row.is_deceased ?? false,
    date_of_death: toPartialIso(
      row.date_of_death,
      row.date_of_death_precision ?? "day",
    ),
    date_of_death_circa: row.date_of_death_circa ?? false,
    place_id_death: row.place_id_death ?? null,
    place_of_death: row.place_of_death ?? "",
    sex: (row.sex as PersonFormValues["sex"]) ?? undefined,
    lineage_type:
      (row.lineage_type as PersonFormValues["lineage_type"]) ?? undefined,
    email: row.email ?? "",
    email_visible: row.email_visible ?? false,
  };
}

function trimOrNull(s?: string): string | null {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : null;
}

/** Normalise validated form values into the shape the DB writers expect. */
export function toPersonPayload(values: PersonFormValues) {
  const birth = toStoredDate(values.date_of_birth);
  const death = values.is_deceased
    ? toStoredDate(values.date_of_death)
    : { date: null, precision: "day" as const };
  // A birthday without its year (Step 63) has no date, only these.
  const birthday = birth.withoutYear;
  return {
    first_name: trimOrNull(values.first_name),
    middle_name: trimOrNull(values.middle_name),
    preferred_name: trimOrNull(values.preferred_name),
    maiden_name: trimOrNull(values.maiden_name),
    last_name: values.last_name.trim(),
    date_of_birth: birth.date,
    date_of_birth_precision: birth.precision,
    birth_month: birthday?.month ?? null,
    birth_day: birthday?.day ?? null,
    // Circa only beside a date with its year (Step 81).
    date_of_birth_circa: Boolean(values.date_of_birth_circa) && birth.date !== null,
    place_id_birth: values.place_id_birth ?? null,
    city_of_birth: trimOrNull(values.city_of_birth),
    country_of_birth: (values.country_of_birth ?? "").trim(),
    is_deceased: values.is_deceased,
    date_of_death: death.date,
    date_of_death_precision: death.precision,
    date_of_death_circa: Boolean(values.date_of_death_circa) && death.date !== null,
    place_id_death: values.is_deceased ? (values.place_id_death ?? null) : null,
    place_of_death: values.is_deceased
      ? trimOrNull(values.place_of_death)
      : null,
    sex: values.sex ?? null,
    lineage_type: values.lineage_type ?? null,
    email: trimOrNull(values.email)?.toLowerCase() ?? null,
    email_visible: values.email_visible ?? false,
  };
}
