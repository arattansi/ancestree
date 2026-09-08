export type NamedPerson = {
  first_name?: string | null;
  preferred_name?: string | null;
  last_name?: string | null;
};

/** Display name for a person: preferred name (or first name) + last name. */
export function personDisplayName(p: NamedPerson): string {
  const first = (p.preferred_name || p.first_name || "").trim();
  const last = (p.last_name || "").trim();
  return [first, last].filter(Boolean).join(" ") || "Unnamed person";
}

/**
 * The name as a card on the canvas shows it.
 *
 * A card is 208px wide and a name is the one thing on it that has to be read,
 * so a long one is shortened to the surname's initial — "Shahsultan R." rather
 * than "Shahsultan Ratt…". Losing the surname to an ellipsis loses the family;
 * an initial keeps it. Nothing is shortened that already fits.
 */
export function nodeDisplayName(p: NamedPerson, limit = 16): string {
  const full = personDisplayName(p);
  if (full.length <= limit) return full;
  const first = (p.preferred_name || p.first_name || "").trim();
  const last = (p.last_name || "").trim();
  if (!first || !last) return full;
  return `${first} ${last[0]}.`;
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

/** "25 August 1992" from an ISO date, for the hover card on a leaf. */
export function formatFullDate(iso?: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Two-letter initials for the avatar fallback. */
export function personInitials(p: NamedPerson): string {
  const first = (p.preferred_name || p.first_name || "").trim();
  const last = (p.last_name || "").trim();
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?";
}
