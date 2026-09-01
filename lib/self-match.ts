import { personDisplayName, personLifespan } from "@/lib/person-name";

/**
 * One unclaimed entry that looks like the name a new member typed during
 * onboarding. Scored by `search_self_candidates` (0..1, spelling-tolerant).
 */
export type SelfCandidate = {
  id: string;
  name: string;
  /** `b. 1948`, `1948 – 2019`, … or `null`. */
  lifespan: string | null;
  birthplace: string | null;
  /** `"Amina & Karim"` — the strongest "is this me?" cue in a family tree. */
  parents: string | null;
  score: number;
};

/** Collapse whitespace so " aalim  " and "aalim" search the same. */
export function normalizeTypedName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** A search needs both halves — the last name alone matches half the tree. */
export function canSearchName(first: string, last: string): boolean {
  return normalizeTypedName(first).length > 0 && normalizeTypedName(last).length > 0;
}

/**
 * Near-certain matches are shown first and plainly; weaker ones get a
 * "close match" hint so nobody claims a cousin by accident.
 */
export function matchConfidence(score: number): "strong" | "close" {
  return score >= 0.85 ? "strong" : "close";
}

/** One-line context under a candidate's name: dates, birthplace, parents. */
export function candidateSummary(c: SelfCandidate): string {
  const parts = [
    c.lifespan,
    c.birthplace,
    c.parents ? `child of ${c.parents}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No other details on file";
}

type CandidateRow = {
  id: string;
  first_name: string | null;
  preferred_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  date_of_death: string | null;
  is_deceased: boolean;
  city_of_birth: string | null;
  country_of_birth: string | null;
  parent_names: string | null;
  score: number;
};

/** Shape a `search_self_candidates` row for the onboarding list. */
export function toSelfCandidate(row: CandidateRow): SelfCandidate {
  return {
    id: row.id,
    name: personDisplayName(row),
    lifespan: personLifespan(row),
    birthplace:
      [row.city_of_birth, row.country_of_birth].filter(Boolean).join(", ") ||
      null,
    parents: row.parent_names,
    score: row.score,
  };
}
