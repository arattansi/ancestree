/**
 * Which option the place picker shows as chosen.
 *
 * The picker's option list only ever holds the latest search results, so the
 * chosen place can't be looked up there: the moment a search came back
 * without it, the picker fell back to "Selected place" (or the label the form
 * opened with) and Base UI rewrote the input to match. The place the member
 * picked wins for as long as it is still the form's value; otherwise the
 * fallback built from the label the form was opened with.
 *
 * Identity matters as much as the answer. Base UI re-syncs the input text
 * whenever the selected object changes, so the same inputs must give back the
 * same object — never a fresh one per render or per search.
 */
export function chosenPlace<T extends { value: number }>(
  value: number | null,
  picked: T | null,
  fallback: T | null,
): T | null {
  if (value == null) return null;
  if (picked && picked.value === value) return picked;
  return fallback;
}

/**
 * Whether what was typed into the picker is a link — a page about the village
 * pasted in, say — rather than a name. The search only matches names, so a
 * link finds nothing, and it mustn't become the name of a new place.
 */
export function isLink(text: string): boolean {
  return /^([a-z][a-z\d+.-]*:\/\/|www\.)/i.test(text.trim());
}

/**
 * The place's own name in what was typed: the part before the first comma,
 * since "Sisang, Gujarat" names Sisang, in Gujarat (Step 66). Empty for a link.
 * It's what a Root is offered to add and what the add dialog starts with.
 */
export function typedPlaceName(typed: string): string {
  const text = typed.trim();
  return isLink(text) ? "" : text.split(",")[0].trim();
}

/**
 * Letters a search needs before it looks for them anywhere in a place's name
 * (Step 66.5). The trigram index can't serve fewer than three, so a
 * two-letter search scanned every place; two letters now only find a place
 * with that whole name (Bo, Ho, Wa).
 */
export const MIN_LETTERS = 3;

/**
 * What the picker says when a search turns up nothing, and — for a Root — the
 * name it offers to add as a new place (Step 64): a small village GeoNames'
 * cities500 left out is added from right there, not only from the link under
 * the field.
 */
export function unmatchedSearch(
  typed: string,
  { canAdd }: { canAdd: boolean },
): { note: string; add: string | null } {
  const text = typed.trim();
  if (isLink(text)) return { note: "Type the place’s name, not a link.", add: null };
  const name = typedPlaceName(text);
  if (!name && text) return { note: "Type the place’s name first.", add: null };
  if (name.length < MIN_LETTERS) {
    return { note: "Type at least three letters.", add: null };
  }
  return { note: "No matching place.", add: canAdd ? name : null };
}
