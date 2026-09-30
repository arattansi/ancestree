/**
 * What a person's fixed choices are called, apart from the form's schema
 * (Step 87.4, audit C1): the bell and the details sheet show them, and
 * importing them from `person-schema` brought zod onto every page.
 */

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
