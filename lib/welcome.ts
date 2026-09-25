/**
 * The welcome on a tree (Step 50), for someone whose entry a relative made
 * and who has just made it theirs, by accepting a claim invite or claiming
 * it on onboarding: what it asks them for, and how it shows what's there.
 * A member who brought their own entry is only greeted (`/welcome?returning=1`).
 */

import { blankFields, type Fillable } from "@/lib/fill-blanks";
import { formatPartialDate, toStoredDate } from "@/lib/partial-date";
import type { PersonFormValues } from "@/lib/person-schema";

/** Their entry as the form holds it, and whether it has a photo. */
export type WelcomeEntry = PersonFormValues & { photo_path: string | null };

/**
 * What the welcome asks for up front: whatever is empty on their entry
 * (`blankFields`), a photo included. The rest waits behind "Change".
 */
export function welcomeAsks(entry: WelcomeEntry): Fillable[] {
  return blankFields({
    first_name: entry.first_name ?? null,
    middle_name: entry.middle_name ?? null,
    preferred_name: entry.preferred_name ?? null,
    maiden_name: entry.maiden_name ?? null,
    sex: entry.sex ?? null,
    date_of_birth: entry.date_of_birth || null,
    place_id_birth: entry.place_id_birth,
    city_of_birth: entry.city_of_birth ?? null,
    country_of_birth: entry.country_of_birth ?? null,
    is_deceased: entry.is_deceased,
    date_of_death: entry.date_of_death || null,
    place_id_death: entry.place_id_death,
    place_of_death: entry.place_of_death ?? null,
    photo_path: entry.photo_path,
  });
}

/** "Welcome, Nasim": the name the tree calls them by. */
export function welcomeTitle(entry: {
  first_name?: string | null;
  preferred_name?: string | null;
}): string {
  const name = (entry.preferred_name || entry.first_name || "").trim();
  return name ? `Welcome, ${name}` : "Welcome";
}

/** Who put them on the tree, or just that they're on it. */
export function addedYou(inviter: string | null, treeName: string): string {
  return inviter
    ? `${inviter} added you to ${treeName}.`
    : `You’re on ${treeName}.`;
}

/**
 * A middle or a preferred name is there to reach for, not a box to fill
 * (`PersonNameFields` offers them as links), so it's never "missing".
 */
const OFFERED: readonly Fillable[] = ["middle_name", "preferred_name"];

/** Whether anything is missing past a name to reach for. */
export function missesAnything(asks: readonly Fillable[]): boolean {
  return asks.some((field) => !OFFERED.includes(field));
}

/**
 * What the welcome asks, in the fewest words: a photo and whatever else is
 * empty, or only a look when nothing is.
 */
export function welcomeAsk(asks: readonly Fillable[]): string {
  const photo = asks.includes("photo");
  const rest = missesAnything(asks.filter((field) => field !== "photo"));
  if (photo && rest) return "Add a photo and what’s missing.";
  if (photo) return "Add a photo.";
  if (rest) return "Add what’s missing.";
  return "Check your details.";
}

/**
 * What their entry says past their name, as a relative entered it: "Born 3
 * May 1950 in Kampala, Uganda", a maiden name first ("née Jaffer, born
 * 1950"). `null` when there's nothing past the name.
 */
export function enteredLine(
  entry: {
    maiden_name?: string | null;
    /** As the form holds it: "1950", "1950-05" or "1950-05-03". */
    date_of_birth?: string | null;
  },
  birthPlace: string | null | undefined,
): string | null {
  const maiden = entry.maiden_name?.trim();
  const stored = toStoredDate(entry.date_of_birth);
  const born = formatPartialDate(stored.date, stored.precision);
  const place = birthPlace?.trim();
  const birth =
    born && place
      ? `born ${born} in ${place}`
      : born
        ? `born ${born}`
        : place
          ? `born in ${place}`
          : null;
  const line = [maiden ? `née ${maiden}` : null, birth]
    .filter(Boolean)
    .join(", ");
  if (!line) return null;
  // "née" keeps its small letter, as it's written.
  return line.startsWith("born") ? `B${line.slice(1)}` : line;
}
