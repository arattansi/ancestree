import type { ConnectionEdge, PersonRef } from "@/lib/connections";
import { toStoredDate } from "@/lib/partial-date";

/**
 * Children under 18 (Step 98): only their parent adds them. Adding someone
 * who could be a child — a child, a sibling, a grandchild through anyone in
 * between — asks "Is {name} 18 or older?" unless the member adding them is
 * recorded as their parent in the same save, and a "No" stops the save.
 * Nobody is asked about someone who has died. The database asks the same of
 * `add_people_with_connections` (`MINOR`), so these only say it first.
 */
export const ADULT_AGE = 18;

/** "YYYY-MM-DD" of the latest birthday that is 18 today (UTC). */
export function adultCutoff(today: Date = new Date()): string {
  const y = today.getUTCFullYear() - ADULT_AGE;
  const m = today.getUTCMonth() + 1;
  // 29 February has no twin 18 years back: the 28th, as Postgres counts.
  const d = m === 2 && today.getUTCDate() === 29 ? 28 : today.getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * What a date of birth, as the form holds it ("1990", "1990-04",
 * "1990-04-12"), says about being 18: certainly an adult, certainly not, or
 * not enough to tell (no year, or a year or month that straddles the day).
 */
export function ageFromBirth(
  dateOfBirth: string | null | undefined,
  today: Date = new Date(),
): "adult" | "minor" | "unknown" {
  const { date, precision } = toStoredDate(dateOfBirth);
  if (!date) return "unknown";
  const cutoff = adultCutoff(today);
  // The earliest day they could have been born is the stored one; the latest
  // is the end of its month or year.
  if (date > cutoff) return "minor";
  const [y, m] = date.split("-").map(Number);
  const latest =
    precision === "year"
      ? `${y}-12-31`
      : precision === "month"
        ? `${y}-${String(m).padStart(2, "0")}-${String(
            new Date(Date.UTC(y, m, 0)).getUTCDate(),
          ).padStart(2, "0")}`
        : date;
  return latest <= cutoff ? "adult" : "unknown";
}

const sameRef = (a: PersonRef, b: PersonRef) =>
  a.kind === b.kind &&
  (a.kind === "new"
    ? a.index === (b as { index: number }).index
    : a.id === (b as { id: string }).id);

/**
 * The new people (`new:i` indices) a save must ask "18 or older?" about:
 * each living one who is someone's child or sibling once `edges` are drawn,
 * unless the member's own entry (`self`, existing or being made) is drawn as
 * their parent, or their date of birth already says they're an adult. The
 * member's own new entry is never asked about.
 */
export function newPeopleToAsk({
  people,
  edges,
  self,
  today,
}: {
  people: readonly { is_deceased: boolean; date_of_birth?: string | null }[];
  edges: readonly ConnectionEdge[];
  /** The member's own entry: on the tree already, or the one being added. */
  self: PersonRef | null;
  today?: Date;
}): number[] {
  const asked: number[] = [];
  people.forEach((person, i) => {
    const ref: PersonRef = { kind: "new", index: i };
    if (self && sameRef(self, ref)) return;
    if (person.is_deceased) return;
    const parents = edges.filter(
      (e) => e.type === "parent" && sameRef(e.b, ref),
    );
    const sibling = edges.some(
      (e) => e.type === "sibling" && (sameRef(e.a, ref) || sameRef(e.b, ref)),
    );
    if (parents.length === 0 && !sibling) return;
    if (self && parents.some((e) => sameRef(e.a, self))) return;
    if (ageFromBirth(person.date_of_birth, today) === "adult") return;
    asked.push(i);
  });
  return asked;
}

/**
 * Why a save can't go ahead for want of a parent, or null: someone asked
 * about was answered "No", or their date of birth is under 18 whatever the
 * answer. `answers` holds each asked index's answer, undefined while unasked.
 */
export function minorRefusal({
  asked,
  people,
  answers,
  nameOf,
  today,
}: {
  asked: readonly number[];
  people: readonly { date_of_birth?: string | null }[];
  answers: ReadonlyMap<number, boolean>;
  nameOf: (index: number) => string;
  today?: Date;
}): string | null {
  for (const i of asked) {
    if (
      answers.get(i) === false ||
      ageFromBirth(people[i]?.date_of_birth, today) === "minor"
    ) {
      return underAgeMessage(nameOf(i));
    }
  }
  return null;
}

/** What a refusal says (Step 98). */
export function underAgeMessage(name: string | null): string {
  const who = name ?? "This person";
  // It opens the sentence: "this person", the form's stand-in, too.
  return `${who.charAt(0).toUpperCase()}${who.slice(1)} is under 18. Only their parent can add them.`;
}

/** An edit giving someone else a date of birth under 18 (Step 98). */
export const MINOR_DATE_REFUSED =
  "Only their parent can give a date of birth under 18.";

/** The database's `MINOR` refusal, read from a PostgREST error. */
export function readMinorRefusal(
  error: { message?: string | null } | null | undefined,
): { name: string | null } | null {
  const message = error?.message ?? "";
  if (!message.includes("MINOR:")) return null;
  return { name: /MINOR: (.+) is under 18/.exec(message)?.[1]?.trim() || null };
}
