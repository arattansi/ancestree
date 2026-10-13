import type { OrbitSide } from "@/lib/leaf-orbit";

/** `[neutral, male, female]`, as `lib/connection-path.ts` words them. */
const TERMS: Record<OrbitSide, readonly [string, string, string]> = {
  parents: ["Parent", "Father", "Mother"],
  children: ["Child", "Son", "Daughter"],
  spouses: ["Spouse", "Husband", "Wife"],
  siblings: ["Sibling", "Brother", "Sister"],
};

/** What a relative is to the leaf they circle: "Mother", "Former wife". */
export function relationWord(
  side: OrbitSide,
  sex: string | null | undefined,
  former = false,
): string {
  const term = TERMS[side];
  const word = sex === "male" ? term[1] : sex === "female" ? term[2] : term[0];
  return former ? `Former ${word.toLowerCase()}` : word;
}

/** A whole group, for the list behind a "+n" circle: "Siblings". */
export const GROUP_NAMES: Record<OrbitSide, string> = {
  parents: "Parents",
  children: "Children",
  spouses: "Spouses",
  siblings: "Siblings",
};
