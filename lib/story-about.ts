/**
 * Whom a story is about (Step 183): everyone in its About list has it on
 * their details as their own, each once they (or whoever answers for them)
 * said yes.
 */

/** Someone a story is about, and their answer. */
export type StoryPerson = {
  id: string;
  name: string;
  status: "pending" | "approved" | "declined";
};

/** "Amina Khan", "Amina Khan and Hassan Khan", "Amina Khan, Hassan Khan and Zara Khan". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
