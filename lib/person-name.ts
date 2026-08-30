export type NamedPerson = {
  given_name?: string | null;
  preferred_name?: string | null;
  family_name?: string | null;
};

/** Display name for a person: preferred name (or given name) + family name. */
export function personDisplayName(p: NamedPerson): string {
  const first = (p.preferred_name || p.given_name || "").trim();
  const last = (p.family_name || "").trim();
  return [first, last].filter(Boolean).join(" ") || "Unnamed person";
}

const year = (d?: string | null) => (d ? d.slice(0, 4) : null);

/**
 * Short life-span label for a node: `b. 1948`, `1948 – 2019`, or `d. 2019`.
 * Returns `null` when there are no dates and the person is living.
 */
export function personLifespan(p: {
  date_of_birth?: string | null;
  date_of_death?: string | null;
  is_deceased?: boolean | null;
}): string | null {
  const born = year(p.date_of_birth);
  const died = year(p.date_of_death);
  if (born && died) return `${born} – ${died}`;
  if (born) return p.is_deceased ? `b. ${born} · d.` : `b. ${born}`;
  if (died) return `d. ${died}`;
  if (p.is_deceased) return "Deceased";
  return null;
}

/** Two-letter initials for the avatar fallback. */
export function personInitials(p: NamedPerson): string {
  const first = (p.preferred_name || p.given_name || "").trim();
  const last = (p.family_name || "").trim();
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?";
}
