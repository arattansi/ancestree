import { asDayMonth, formatPartialDate } from "@/lib/partial-date";
import { SEX_LABELS, type Sex } from "@/lib/person-labels";

/**
 * Held-back details (Step 98.3). The children under 18 added before Step 98
 * by someone other than their parent became placeholders, and what they'd
 * been given was kept back from the family, not deleted
 * (`private.withheld_details`). Their parent sees it and chooses what to
 * show (`reveal_withheld_details`), or drops it (`forget_withheld_details`);
 * the child, once the entry is theirs, sees it too. Read through
 * `withheld_details`, which answers nobody else.
 */
export type HeldBackDetails = {
  first_name?: string;
  middle_name?: string;
  preferred_name?: string;
  maiden_name?: string;
  last_name?: string;
  date_of_birth?: string;
  date_of_birth_precision?: string;
  date_of_birth_circa?: boolean;
  birth_month?: number;
  birth_day?: number;
  city_of_birth?: string;
  country_of_birth?: string;
  place_id_birth?: number;
  sex?: string;
  email?: string;
  email_visible?: boolean;
  photo_path?: string;
};

/** What the parent ticks, as `reveal_withheld_details` takes it. */
export const HELD_BACK_GROUPS = [
  "name",
  "birth",
  "birthplace",
  "sex",
  "email",
  "photo",
] as const;
export type HeldBackGroup = (typeof HELD_BACK_GROUPS)[number];

/** One line of the list: what it is and what it says. */
export type HeldBackRow = { group: HeldBackGroup; label: string; value: string };

/**
 * The held-back details as the sheet lists them, one row a group that has
 * anything in it, in the order of `HELD_BACK_GROUPS`. Empty when nothing is
 * held back.
 */
export function heldBackRows(d: HeldBackDetails | null | undefined): HeldBackRow[] {
  if (!d) return [];
  const rows: HeldBackRow[] = [];
  const name = [
    d.preferred_name ? `${d.first_name ?? ""} (${d.preferred_name})`.trim() : d.first_name,
    d.middle_name,
    d.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  if (name) {
    rows.push({
      group: "name",
      label: "Name",
      value: d.maiden_name ? `${name} (née ${d.maiden_name})` : name,
    });
  }
  const born = formatPartialDate(
    d.date_of_birth,
    d.date_of_birth_precision,
    asDayMonth(d.birth_month, d.birth_day),
    d.date_of_birth_circa,
  );
  if (born) rows.push({ group: "birth", label: "Date of birth", value: born });
  const place = [d.city_of_birth, d.country_of_birth].filter(Boolean).join(", ");
  if (place) rows.push({ group: "birthplace", label: "Place of birth", value: place });
  if (d.sex) {
    rows.push({ group: "sex", label: "Sex", value: SEX_LABELS[d.sex as Sex] ?? d.sex });
  }
  if (d.email) rows.push({ group: "email", label: "Email", value: d.email });
  if (d.photo_path) rows.push({ group: "photo", label: "Photo", value: "A photo" });
  return rows;
}

/**
 * What a press of Show sends: the ticked groups, the name always among
 * them (an entry needs one), in a fixed order.
 */
export function groupsToShow(ticked: Iterable<HeldBackGroup>): HeldBackGroup[] {
  const set = new Set<HeldBackGroup>(ticked);
  set.add("name");
  return HELD_BACK_GROUPS.filter((g) => set.has(g));
}
