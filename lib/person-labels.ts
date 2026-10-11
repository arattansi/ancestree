/**
 * What a person's fixed choices are called, apart from the form's schema
 * (Step 87.4, audit C1): the bell and the details sheet show them, and
 * importing them from `person-schema` brought zod onto every page.
 */

/** Optional self-reported sex. `undisclosed` = "Prefer not to disclose". */
export const SEX_VALUES = ["male", "female", "undisclosed"] as const;
export type Sex = (typeof SEX_VALUES)[number];

export const SEX_LABELS: Record<Sex, string> = {
  male: "Male",
  female: "Female",
  undisclosed: "Prefer not to disclose",
};
