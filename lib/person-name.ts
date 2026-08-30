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
