/**
 * Nickname groups behind the onboarding name search (Step 15.1). Rows are
 * `(variant, canonical)` pairs; two names match when they share a canonical.
 * Every group also carries an identity row (`robert → robert`) so both sides
 * of a comparison resolve the same way — the admin panel manages that for you.
 */
export type NicknameGroup = {
  /** The folded root name, e.g. `robert`. */
  canonical: string;
  /** Folded nicknames, alphabetical, excluding the identity row. */
  variants: string[];
};

/** Mirror of `private.fold_name`: lowercase, strip accents and punctuation. */
export function foldName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 120);
}

/** Why a name can't go in the table, or `null` when it's fine. */
export function nicknameInputError(
  root: string,
  nickname: string,
): string | null {
  const canonical = foldName(root);
  const variant = foldName(nickname);
  if (canonical.length < 2) return "Enter a root name of at least 2 letters.";
  if (variant.length < 2) return "Enter a nickname of at least 2 letters.";
  if (canonical === variant) {
    return "The nickname has to differ from the root name.";
  }
  return null;
}

/** Fold `(variant, canonical)` rows into one group per root, alphabetical. */
export function groupNicknames(
  rows: { variant: string; canonical: string }[],
): NicknameGroup[] {
  const byCanonical = new Map<string, string[]>();
  for (const row of rows) {
    const variants = byCanonical.get(row.canonical) ?? [];
    // The identity row is bookkeeping, not something to show or remove.
    if (row.variant !== row.canonical) variants.push(row.variant);
    byCanonical.set(row.canonical, variants);
  }
  return [...byCanonical.entries()]
    .map(([canonical, variants]) => ({
      canonical,
      variants: [...variants].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.canonical.localeCompare(b.canonical));
}

/** Groups whose root or any nickname contains the typed text. */
export function filterNicknameGroups(
  groups: NicknameGroup[],
  query: string,
): NicknameGroup[] {
  const needle = foldName(query);
  if (!needle) return groups;
  return groups.filter(
    (g) =>
      g.canonical.includes(needle) ||
      g.variants.some((v) => v.includes(needle)),
  );
}
