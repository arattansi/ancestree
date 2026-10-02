/**
 * Two of the Root console's Overview numbers (Step 109): how many countries
 * the tree's entries were born in, and how many years back its earliest
 * birth on record goes. Pure, so the console only reads the entries.
 */

/** A country as typed, so "Côte d’Ivoire" and "cote d'ivoire " are one. */
function countryKey(country: string): string {
  return country
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Countries the entries were born in, each counted once; blanks aren't one. */
export function countriesRepresented(
  people: { country_of_birth: string | null }[],
): number {
  const keys = new Set<string>();
  for (const p of people) {
    const key = countryKey(p.country_of_birth ?? "");
    if (key) keys.add(key);
  }
  return keys.size;
}

/**
 * Years from the earliest birth year on the tree to this one: 128 for a
 * tree whose oldest documented birth is 1898, in 2026. A birthday kept
 * without its year (Step 63) has no `date_of_birth`, so it doesn't count;
 * a circa year does. 0 when nobody's birth date is known.
 */
export function yearsDocumented(
  people: { date_of_birth: string | null }[],
  now: Date,
): number {
  let earliest: number | null = null;
  for (const p of people) {
    const year = p.date_of_birth ? Number(p.date_of_birth.slice(0, 4)) : NaN;
    if (Number.isFinite(year) && (earliest === null || year < earliest)) {
      earliest = year;
    }
  }
  return earliest === null ? 0 : Math.max(0, now.getFullYear() - earliest);
}
