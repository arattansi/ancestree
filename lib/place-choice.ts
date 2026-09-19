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
