import { personDisplayName } from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";

/** Whether an entry must be living, deceased, or either. */
export type LivingStatus = "any" | "living" | "deceased";

/** The demographic filter the tree search panel drives. */
export type TreeFilter = {
  /** Free text matched against names and birth/death places. */
  text: string;
  /** Exact `country_of_birth`, or `""` for any. */
  country: string;
  /** Birth decade as a 4-digit string (e.g. `"1950"`), or `""` for any. */
  birthDecade: string;
  /** Living / deceased / any. */
  living: LivingStatus;
};

export const EMPTY_FILTER: TreeFilter = {
  text: "",
  country: "",
  birthDecade: "",
  living: "any",
};

export function isFilterActive(f: TreeFilter): boolean {
  return (
    f.text.trim() !== "" ||
    f.country !== "" ||
    f.birthDecade !== "" ||
    f.living !== "any"
  );
}

/** Lowercase and strip diacritics so "Jose" matches "José". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function birthYear(p: TreeGraphPerson): number | null {
  if (!p.date_of_birth) return null;
  const y = Number(p.date_of_birth.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function matchesFilter(p: TreeGraphPerson, f: TreeFilter): boolean {
  const text = f.text.trim();
  if (text) {
    const needle = fold(text);
    const haystack = fold(
      [
        personDisplayName(p),
        p.given_name,
        p.preferred_name,
        p.maiden_name,
        p.family_name,
        p.city_of_birth,
        p.country_of_birth,
        p.place_of_death,
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (!haystack.includes(needle)) return false;
  }

  if (f.country && p.country_of_birth !== f.country) return false;

  if (f.birthDecade) {
    const y = birthYear(p);
    if (y === null || Math.floor(y / 10) * 10 !== Number(f.birthDecade)) {
      return false;
    }
  }

  if (f.living === "living" && p.is_deceased) return false;
  if (f.living === "deceased" && !p.is_deceased) return false;

  return true;
}

/** Distinct countries present in the tree, alphabetical. */
export function countryOptions(people: TreeGraphPerson[]): string[] {
  const set = new Set<string>();
  for (const p of people) {
    if (p.country_of_birth) set.add(p.country_of_birth);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Distinct birth decades present in the tree, newest first (as `"1950"`). */
export function decadeOptions(people: TreeGraphPerson[]): string[] {
  const set = new Set<number>();
  for (const p of people) {
    const y = birthYear(p);
    if (y !== null) set.add(Math.floor(y / 10) * 10);
  }
  return [...set].sort((a, b) => b - a).map(String);
}
