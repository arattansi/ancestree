/**
 * Marking someone deceased or living (Step 218), apart from editing them: a
 * Branch may anywhere on the entry's home tree, another member's own entry
 * included (`lib/branch.ts#canSetLifeStatus`, `private.can_set_life_status`).
 * Marked deceased, they may be given a date and place of death where none is
 * recorded; marked living, the death details go, as the edit form does it.
 */

import { fillFields, filledPhrase } from "@/lib/fill-blanks";
import type { toPersonPayload } from "@/lib/person-schema";

const DEATH_FIELDS = [
  "date_of_death",
  "date_of_death_precision",
  "date_of_death_circa",
  "place_id_death",
  "place_of_death",
] as const;

/** What `set_life_status` takes of a death: its date and place, blanks left out. */
export function deathFields(
  person: ReturnType<typeof toPersonPayload>,
): Record<string, string | number> {
  const fields = fillFields(person);
  return Object.fromEntries(
    DEATH_FIELDS.flatMap((key) => {
      const value = fields[key];
      return typeof value === "string" || typeof value === "number"
        ? [[key, value]]
        : [];
    }),
  );
}

/** The death details that go when someone is marked living, as the dialog says it. */
export function whatGoes(person: {
  date_of_death: string | null;
  place_id_death: number | null;
  place_of_death: string | null;
}): string | null {
  const date = !!person.date_of_death;
  const place = person.place_id_death != null || !!person.place_of_death?.trim();
  if (date && place) return "Their date and place of death go.";
  if (date) return "Their date of death goes.";
  if (place) return "Their place of death goes.";
  return null;
}

/** What the toast says once `set_life_status` answers with what changed. */
export function lifeStatusToast(
  name: string,
  deceased: boolean,
  changed: readonly string[],
): string {
  if (changed.length === 0) {
    return "Nothing changed: someone may have just done that.";
  }
  if (!deceased) return `${name} is marked as living.`;
  if (changed.includes("is_deceased")) return `${name} is marked as deceased.`;
  return `Added their ${filledPhrase(changed)}.`;
}
