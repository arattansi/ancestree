import type { TablesUpdate } from "@/lib/database.types";
import {
  asDayMonth,
  dateProblem,
  isBeforeAtSharedPrecision,
  splitDateParts,
  toPartialIso,
  toStoredDate,
} from "@/lib/partial-date";
import { SEX_VALUES, type Sex } from "@/lib/person-labels";

/**
 * Editing an entry's details on the phone (Step 203): the member's own
 * leaf, or one they own, from Settings. The web's person form decides with
 * zod (`lib/person-schema.ts`), which the phone doesn't carry, so these are
 * the same rules and the same columns, written out for the fields the
 * phone's form shows. Its photo, email and connections stay the web's. The
 * database decides again on the write (`people_update`, `can_edit_person`).
 */

/** What the form reads of an entry, from `people`. */
export const ENTRY_EDIT_COLUMNS =
  "id, first_name, middle_name, preferred_name, maiden_name, last_name, sex, date_of_birth, date_of_birth_precision, birth_month, birth_day, date_of_birth_circa, city_of_birth, country_of_birth, is_deceased, date_of_death, date_of_death_precision, date_of_death_circa, place_of_death, place_of_residence, placeholder_number";

export type EntryRow = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  preferred_name: string | null;
  maiden_name: string | null;
  last_name: string;
  sex: string | null;
  date_of_birth: string | null;
  date_of_birth_precision: string | null;
  birth_month: number | null;
  birth_day: number | null;
  date_of_birth_circa: boolean | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  is_deceased: boolean | null;
  date_of_death: string | null;
  date_of_death_precision: string | null;
  date_of_death_circa: boolean | null;
  place_of_death: string | null;
  place_of_residence: string | null;
  placeholder_number: number | null;
};

/** The form's values. Dates as typed: "1931", "1931-03", "-03-05". */
export type EntryEdit = {
  firstName: string;
  middleName: string;
  preferredName: string;
  maidenName: string;
  lastName: string;
  sex: Sex | null;
  born: string;
  bornCirca: boolean;
  died: boolean;
  death: string;
  deathCirca: boolean;
};

/**
 * A place picked in the form, as an entry keeps it beside the place's id
 * (`placeText`): the town, the country, and the two as one label. `null`
 * is a place taken away.
 */
export type PlaceChoice = { id: number; city: string; country: string; label: string } | null;

/** Only the places the member changed: the rest are left as they are. */
export type PlaceChanges = {
  birth?: PlaceChoice;
  death?: PlaceChoice;
  residence?: PlaceChoice;
};

export type EntryEditProblems = Partial<Record<"name" | "lastName" | "born" | "death", string>>;

/** What the form opens with for a stored entry. */
export function entryEditOf(row: EntryRow): EntryEdit {
  return {
    firstName: row.first_name ?? "",
    middleName: row.middle_name ?? "",
    preferredName: row.preferred_name ?? "",
    maidenName: row.maiden_name ?? "",
    lastName: row.last_name,
    sex: SEX_VALUES.find((s) => s === row.sex) ?? null,
    born: toPartialIso(
      row.date_of_birth,
      row.date_of_birth_precision ?? "day",
      asDayMonth(row.birth_month, row.birth_day),
    ),
    bornCirca: row.date_of_birth_circa ?? false,
    died: row.is_deceased ?? false,
    death: toPartialIso(row.date_of_death, row.date_of_death_precision ?? "day"),
    deathCirca: row.date_of_death_circa ?? false,
  };
}

/** Where an entry's place of birth is shown from: its town and country. */
export function birthPlaceLabel(row: Pick<EntryRow, "city_of_birth" | "country_of_birth">): string {
  return [row.city_of_birth, row.country_of_birth].filter(Boolean).join(", ");
}

const CIRCA_NEEDS_A_YEAR = "Add the year, or untick circa.";

/** What's wrong with the form, field by field, as `personSchema` says it. */
export function entryEditProblems(edit: EntryEdit): EntryEditProblems {
  const problems: EntryEditProblems = {};
  if (!edit.firstName.trim() && !edit.preferredName.trim()) {
    problems.name = "Enter a first name or a preferred name.";
  }
  if (!edit.lastName.trim()) problems.lastName = "Last name is required.";
  const born =
    dateProblem(edit.born, { allowPartial: true, allowNoYear: true }) ??
    (edit.bornCirca && !splitDateParts(edit.born).year ? CIRCA_NEEDS_A_YEAR : null);
  if (born) problems.born = born;
  if (edit.died) {
    const death =
      dateProblem(edit.death, { allowPartial: true }) ??
      (edit.deathCirca && !splitDateParts(edit.death).year ? CIRCA_NEEDS_A_YEAR : null) ??
      (isBeforeAtSharedPrecision(edit.death, edit.born)
        ? "Date of death can't be before the date of birth."
        : null);
    if (death) problems.death = death;
  }
  return problems;
}

function trimOrNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

/**
 * The columns a save writes, as `toPersonPayload` shapes them: every field
 * the form shows, and only the places the member changed. A place of death
 * goes with "has died" untold; where they live, with it told (Step 153).
 */
export function entryEditChanges(
  edit: EntryEdit,
  places: PlaceChanges = {},
): TablesUpdate<"people"> {
  const birth = toStoredDate(edit.born);
  const death = edit.died
    ? toStoredDate(edit.death)
    : { date: null, precision: "day" as const };
  const changes: TablesUpdate<"people"> = {
    first_name: trimOrNull(edit.firstName),
    middle_name: trimOrNull(edit.middleName),
    preferred_name: trimOrNull(edit.preferredName),
    maiden_name: trimOrNull(edit.maidenName),
    last_name: edit.lastName.trim(),
    sex: edit.sex,
    date_of_birth: birth.date,
    date_of_birth_precision: birth.precision,
    // A birthday without its year (Step 63) has no date, only these.
    birth_month: birth.withoutYear?.month ?? null,
    birth_day: birth.withoutYear?.day ?? null,
    // Circa only beside a date with its year (Step 81).
    date_of_birth_circa: edit.bornCirca && birth.date !== null,
    is_deceased: edit.died,
    date_of_death: death.date,
    date_of_death_precision: death.precision,
    date_of_death_circa: edit.died && edit.deathCirca && death.date !== null,
  };
  if (places.birth !== undefined) {
    changes.place_id_birth = places.birth?.id ?? null;
    changes.city_of_birth = places.birth ? trimOrNull(places.birth.city) : null;
    changes.country_of_birth = places.birth?.country.trim() ?? "";
  }
  if (!edit.died) {
    changes.place_id_death = null;
    changes.place_of_death = null;
  } else if (places.death !== undefined) {
    changes.place_id_death = places.death?.id ?? null;
    changes.place_of_death = places.death ? trimOrNull(places.death.label) : null;
  }
  if (edit.died) {
    changes.place_id_residence = null;
    changes.place_of_residence = null;
  } else if (places.residence !== undefined) {
    changes.place_id_residence = places.residence?.id ?? null;
    changes.place_of_residence = places.residence ? trimOrNull(places.residence.label) : null;
  }
  return changes;
}
