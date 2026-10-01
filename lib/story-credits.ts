import { takenProblem } from "@/lib/album-taken";
import { formatPartialDate } from "@/lib/partial-date";

/**
 * Who a story is credited to (Step 99): the people on the tree who told it,
 * its **storytellers**, and who asked, its **interviewers**, and when it
 * was told. Told with the story and read back with it.
 */

export const STORY_CREDIT_ROLES = ["storyteller", "interviewer"] as const;
export type StoryCreditRole = (typeof STORY_CREDIT_ROLES)[number];

/** At most this many people in each role. */
export const STORY_CREDIT_MAX = 10;

export type StoryCredit = {
  id: string;
  /** As the trees name them. */
  name: string;
  role: StoryCreditRole;
};

/** What's wrong with the date a story was told, or null: as a photo's. */
export const toldProblem = takenProblem;

/** The credits a database row holds, whatever its shape (`jsonb`). */
export function asCredits(value: unknown): StoryCredit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((c): StoryCredit[] => {
    if (!c || typeof c !== "object") return [];
    const { id, name, role } = c as Record<string, unknown>;
    if (typeof id !== "string") return [];
    if (role !== "storyteller" && role !== "interviewer") return [];
    return [{ id, name: typeof name === "string" && name ? name : "A relative", role }];
  });
}

/** "Storyteller" or "Storytellers", "Interviewer" or "Interviewers". */
export function creditLabel(role: StoryCreditRole, count: number): string {
  const label = role === "storyteller" ? "Storyteller" : "Interviewer";
  return count === 1 ? label : `${label}s`;
}

/** The credits grouped by role, storytellers first; a role with nobody is left out. */
export function creditGroups(
  credits: StoryCredit[],
): { role: StoryCreditRole; label: string; people: { id: string; name: string }[] }[] {
  return STORY_CREDIT_ROLES.flatMap((role) => {
    const people = credits
      .filter((c) => c.role === role)
      .map(({ id, name }) => ({ id, name }));
    return people.length > 0
      ? [{ role, label: creditLabel(role, people.length), people }]
      : [];
  });
}

/** "Told 16 July 1985", as much of it as is known; null when it has no date. */
export function toldLabel(
  toldOn: string | null | undefined,
  precision: string | null | undefined,
): string | null {
  const date = formatPartialDate(toldOn, precision);
  return date ? `Told ${date}` : null;
}
