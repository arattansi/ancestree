/**
 * Filling in what's missing (Step 44). A Branch or a Leaf may fill in the
 * blanks on an entry nobody has claimed, on their own line (`canFillEntry`,
 * `private.can_fill_person`), without being able to change what's there:
 * `fill_person_blanks` sets only what's empty. This says which details are
 * empty the way it does, so the panel knows whether to offer it and the form
 * which fields to show, and turns a form's values into what it takes.
 */

import type { StoredCrop } from "@/lib/image-crop";
import type { toPersonPayload } from "@/lib/person-schema";

/**
 * What can be filled in, in the order the form shows it. Whether someone has
 * died, their last name (never empty), lineage and contact details stay with
 * whoever can edit the entry.
 */
export const FILLABLE = [
  "first_name",
  "middle_name",
  "preferred_name",
  "maiden_name",
  "sex",
  "date_of_birth",
  "place_of_birth",
  "date_of_death",
  "place_of_death",
  "photo",
] as const;

export type Fillable = (typeof FILLABLE)[number];

/** An entry's details, as far as filling them in goes. */
export type FillableEntry = {
  first_name: string | null;
  middle_name: string | null;
  preferred_name: string | null;
  maiden_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  place_id_birth: number | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  is_deceased: boolean;
  date_of_death: string | null;
  place_id_death: number | null;
  place_of_death: string | null;
  photo_path: string | null;
};

const blank = (value: string | null | undefined) => !(value ?? "").trim();

/**
 * The details that are empty on an entry, as `fill_person_blanks` judges
 * them: a birthplace only with no place and no older free-text one either,
 * and a death's date and place only for someone marked as having died.
 */
export function blankFields(entry: FillableEntry): Fillable[] {
  const empty: Record<Fillable, boolean> = {
    first_name: blank(entry.first_name),
    middle_name: blank(entry.middle_name),
    preferred_name: blank(entry.preferred_name),
    maiden_name: blank(entry.maiden_name),
    sex: !entry.sex,
    date_of_birth: !entry.date_of_birth,
    place_of_birth:
      entry.place_id_birth == null &&
      blank(entry.city_of_birth) &&
      blank(entry.country_of_birth),
    date_of_death: entry.is_deceased && !entry.date_of_death,
    place_of_death:
      entry.is_deceased &&
      entry.place_id_death == null &&
      blank(entry.place_of_death),
    photo: !entry.photo_path,
  };
  return FILLABLE.filter((field) => empty[field]);
}

/**
 * What `fill_person_blanks` takes: every detail the form holds, blanks left
 * out. It fills only what's empty on the entry, so what was already there
 * and comes back unchanged is ignored, and so is a value someone else filled
 * in while the form was open.
 */
export function fillFields(
  person: ReturnType<typeof toPersonPayload>,
  photo?: { path: string; crop: StoredCrop } | null,
): Record<string, string | number | StoredCrop> {
  const fields: Record<string, string | number | StoredCrop | null> = {
    first_name: person.first_name,
    middle_name: person.middle_name,
    preferred_name: person.preferred_name,
    maiden_name: person.maiden_name,
    sex: person.sex,
    date_of_birth: person.date_of_birth,
    date_of_birth_precision: person.date_of_birth
      ? person.date_of_birth_precision
      : null,
    // A place comes with the city and country it was picked with.
    place_id_birth: person.place_id_birth,
    city_of_birth: person.place_id_birth != null ? person.city_of_birth : null,
    country_of_birth:
      person.place_id_birth != null ? person.country_of_birth : null,
    date_of_death: person.date_of_death,
    date_of_death_precision: person.date_of_death
      ? person.date_of_death_precision
      : null,
    place_id_death: person.place_id_death,
    place_of_death: person.place_id_death != null ? person.place_of_death : null,
    photo_path: photo?.path ?? null,
    photo_crop: photo?.crop ?? null,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string | number | StoredCrop] =>
        entry[1] !== null && entry[1] !== "",
    ),
  );
}

const FILLED_WORDS: Record<Fillable, string> = {
  first_name: "first name",
  middle_name: "middle name",
  preferred_name: "preferred name",
  maiden_name: "maiden name",
  sex: "sex",
  date_of_birth: "date of birth",
  place_of_birth: "place of birth",
  date_of_death: "date of death",
  place_of_death: "place of death",
  photo: "photo",
};

/**
 * What was filled in, as the toast says it: "place of birth and photo".
 * `fill_person_blanks` names each field it filled; anything it doesn't name
 * that this doesn't know is left out.
 */
export function filledPhrase(filled: readonly string[]): string {
  const words = FILLABLE.filter((f) => filled.includes(f)).map(
    (f) => FILLED_WORDS[f],
  );
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
