import { dateProblem, toStoredDate } from "@/lib/partial-date";

/**
 * What's wrong with an album photo's date taken (Step 88.6), in words for
 * the form, or null; empty is fine. As with a person's dates, a year alone
 * will do ("1962", a scan's), but not a day still to come.
 */
export function takenProblem(value: string, today: Date = new Date()): string | null {
  const problem = dateProblem(value, { allowPartial: true });
  if (problem) return problem;
  const { date } = toStoredDate(value);
  if (!date) return null;
  // Taken today somewhere ahead of this clock is still today.
  const latest = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1),
  )
    .toISOString()
    .slice(0, 10);
  return date > latest ? "That’s after today." : null;
}
