/**
 * Suggesting a change to an entry you can't edit (Step 67). A member of a
 * tree the entry is shown on who may not edit it sends the details as they
 * think they should read; `suggest_entry_change` keeps what differs from the
 * entry, and its owner, the Roots of its home tree and the Branches there
 * who tend it (Step 68) are asked. Whoever may edit it accepts, which makes
 * the change, or declines.
 *
 * A suggestion is kept as the columns it changes (`changes`) and what they
 * held when it was made (`before`), a detail at a time: a date with its
 * precision (and a birthday kept without its year), a place with the labels
 * it was picked with. This says which details there are, turns a form into
 * what the function takes, and reads a suggestion back as rows to show.
 */

import { asDayMonth, formatPartialDate } from "@/lib/partial-date";
import {
  SEX_LABELS,
  type Sex,
  type toPersonPayload,
} from "@/lib/person-schema";

/**
 * What a suggestion may change, in the order it's shown, and the columns
 * each detail changes together. Mirrors `private.suggestion_columns`. A
 * photo, lineage and contact details aren't among them.
 */
export const SUGGESTION_DETAILS = [
  { key: "first_name", label: "First name", columns: ["first_name"] },
  { key: "middle_name", label: "Middle name", columns: ["middle_name"] },
  { key: "preferred_name", label: "Preferred name", columns: ["preferred_name"] },
  { key: "maiden_name", label: "Maiden name", columns: ["maiden_name"] },
  { key: "last_name", label: "Last name", columns: ["last_name"] },
  { key: "sex", label: "Sex", columns: ["sex"] },
  {
    key: "date_of_birth",
    label: "Date of birth",
    columns: [
      "date_of_birth",
      "date_of_birth_precision",
      "birth_month",
      "birth_day",
    ],
  },
  {
    key: "place_of_birth",
    label: "Place of birth",
    columns: ["place_id_birth", "city_of_birth", "country_of_birth"],
  },
  { key: "is_deceased", label: "Deceased", columns: ["is_deceased"] },
  {
    key: "date_of_death",
    label: "Date of death",
    columns: ["date_of_death", "date_of_death_precision"],
  },
  {
    key: "place_of_death",
    label: "Place of death",
    columns: ["place_id_death", "place_of_death"],
  },
] as const;

export type SuggestionDetail = (typeof SUGGESTION_DETAILS)[number]["key"];
export type SuggestionColumn =
  (typeof SUGGESTION_DETAILS)[number]["columns"][number];

/** Some of an entry's columns, as a suggestion holds them. */
export type SuggestionColumns = Partial<Record<SuggestionColumn, unknown>>;

/** A suggestion as the page hands it on. */
export type EntrySuggestion = {
  id: string;
  personId: string;
  /** The viewer made it: theirs to withdraw, not to answer. */
  mine: boolean;
  /** What the suggester was called when they made it. */
  suggesterName: string;
  note: string | null;
  createdAt: string;
  changes: SuggestionColumns;
  /** The same columns as they stood when it was made. */
  before: SuggestionColumns;
};

/** One of the viewer's suggestions that was declined (Steps 71–72). */
export type DeclinedSuggestion = EntrySuggestion & {
  /** Who declined it, as the member directory names them. */
  declinedBy: string | null;
  declineReason: string | null;
  declinedAt: string;
};

/**
 * What `suggest_entry_change` takes: every detail the form holds, as the
 * entry's columns. It keeps only what differs from the entry, so sending
 * the whole form is safe.
 */
export function suggestionValues(
  person: ReturnType<typeof toPersonPayload>,
): Record<SuggestionColumn, string | number | boolean | null> {
  return {
    first_name: person.first_name,
    middle_name: person.middle_name,
    preferred_name: person.preferred_name,
    maiden_name: person.maiden_name,
    last_name: person.last_name,
    sex: person.sex,
    date_of_birth: person.date_of_birth,
    date_of_birth_precision: person.date_of_birth_precision,
    birth_month: person.birth_month,
    birth_day: person.birth_day,
    place_id_birth: person.place_id_birth,
    city_of_birth: person.city_of_birth,
    country_of_birth: person.country_of_birth,
    is_deceased: person.is_deceased,
    date_of_death: person.date_of_death,
    date_of_death_precision: person.date_of_death_precision,
    place_id_death: person.place_id_death,
    place_of_death: person.place_of_death,
  };
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const whole = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

/**
 * How a detail reads — "12 March 1931", "Jamnagar, India", "Yes" — from an
 * entry's columns, or null when it's empty.
 */
export function describeDetail(
  detail: SuggestionDetail,
  values: SuggestionColumns,
): string | null {
  switch (detail) {
    case "sex": {
      const sex = values.sex;
      return typeof sex === "string" && sex in SEX_LABELS
        ? SEX_LABELS[sex as Sex]
        : null;
    }
    case "date_of_birth":
      return formatPartialDate(
        text(values.date_of_birth),
        text(values.date_of_birth_precision),
        asDayMonth(whole(values.birth_month), whole(values.birth_day)),
      );
    case "place_of_birth":
      return (
        [text(values.city_of_birth), text(values.country_of_birth)]
          .filter(Boolean)
          .join(", ") || null
      );
    case "is_deceased":
      return values.is_deceased === true
        ? "Yes"
        : values.is_deceased === false
          ? "No"
          : null;
    case "date_of_death":
      return formatPartialDate(
        text(values.date_of_death),
        text(values.date_of_death_precision),
      );
    case "place_of_death":
      return text(values.place_of_death);
    default:
      return text(values[detail]);
  }
}

/** One detail of a suggestion: what it says now, and what's suggested. */
export type SuggestionRow = {
  detail: SuggestionDetail;
  label: string;
  from: string | null;
  to: string | null;
};

/**
 * What a suggestion would change, a detail at a time, against `reference`:
 * the entry as it stands (or, where that isn't to hand, as it stood). A
 * detail the entry has since come to read the same way is left out.
 */
export function suggestionRows(
  changes: SuggestionColumns,
  reference: SuggestionColumns,
): SuggestionRow[] {
  const after = withChanges(reference, changes);
  return SUGGESTION_DETAILS.flatMap(({ key, label, columns }) => {
    if (!columns.some((column) => column in changes)) return [];
    const from = describeDetail(key, reference);
    const to = describeDetail(key, after);
    return from === to ? [] : [{ detail: key, label, from, to }];
  });
}

/**
 * An entry's columns with a suggestion's laid over them: what the form opens
 * with for someone who has already suggested a change, and what accepting it
 * would leave.
 */
export function withChanges<T extends SuggestionColumns>(
  entry: T,
  changes: SuggestionColumns,
): T {
  const next: SuggestionColumns = { ...entry };
  for (const { columns } of SUGGESTION_DETAILS) {
    for (const column of columns) {
      if (column in changes) next[column] = changes[column];
    }
  }
  return next as T;
}

/**
 * How an answered suggestion reads on a notice that asked about it:
 * "Accepted by Aalim Rattansi.", or with the reason it was declined (Step
 * 69), "Declined by Aalim Rattansi: “Her passport says the 5th.”"
 */
export function answeredLine(answer: {
  status: "accepted" | "declined";
  decidedBy: string | null;
  declineReason?: string | null;
}): string {
  const said = answer.status === "accepted" ? "Accepted" : "Declined";
  const by = answer.decidedBy ? ` by ${answer.decidedBy}` : "";
  const why =
    answer.status === "declined" ? (answer.declineReason ?? "").trim() : "";
  return why ? `${said}${by}: “${why}”` : `${said}${by}.`;
}

/** A stored `changes` or `before`, as columns (anything else is dropped). */
export function asSuggestionColumns(value: unknown): SuggestionColumns {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const known = new Set<string>(
    SUGGESTION_DETAILS.flatMap(({ columns }) => columns),
  );
  return Object.fromEntries(
    Object.entries(value).filter(([column]) => known.has(column)),
  ) as SuggestionColumns;
}
