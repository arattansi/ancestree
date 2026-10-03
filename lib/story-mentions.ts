import { nameKey } from "@/lib/photo-tags";
import type { TagOption } from "@/lib/tag-person";

/** The longest name looked for, in words: given, middles, family. */
const RUN_MAX = 6;

/**
 * The people a written story mentions (Step 116), as it's written: whoever
 * on the tree its words name, to offer as tags. Only an offer: the teller
 * picks.
 *
 * A full name ("Jane Doe", "Jane Q. Doe", a preferred or maiden name in
 * either place) suggests whoever has it. A given name alone ("Jane")
 * suggests someone only when it's written with a capital and nobody else on
 * the tree goes by it, since "Rose" or "Will" may just be words. A card
 * whose name this tree doesn't show suggests nothing.
 */
export function mentionedIn<T extends TagOption>(text: string, options: T[]): T[] {
  // Every run of up to `RUN_MAX` words, once, so a long story is read once
  // rather than once a name.
  const list = nameKey(text).split(" ").filter(Boolean);
  if (list.length === 0) return [];
  const runs = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    let run = "";
    for (let n = 0; n < RUN_MAX && i + n < list.length; n++) {
      run = n === 0 ? list[i] : `${run} ${list[i + n]}`;
      runs.add(run);
    }
  }
  const has = (phrase: string) => runs.has(phrase);
  // Given names as they're written with a capital somewhere in the story.
  const capitalised = new Set(
    text
      .split(/[^\p{L}\p{N}'’]+/u)
      .filter((w) => /^\p{Lu}/u.test(w))
      .map((w) => nameKey(w)),
  );

  const people = options.filter((o) => o.person);
  const givensOf = (o: T) =>
    [o.person!.first, o.person!.preferred].map(nameKey).filter((g) => g.length > 0);
  // How many on the tree go by each given name.
  const goBy = new Map<string, number>();
  for (const o of people) {
    for (const g of new Set(givensOf(o))) goBy.set(g, (goBy.get(g) ?? 0) + 1);
  }

  return people.filter((o) => {
    const p = o.person!;
    const givens = givensOf(o);
    const families = [p.last, p.maiden].map(nameKey).filter(Boolean);
    const middles = nameKey(p.middle);
    for (const g of givens) {
      for (const f of families) {
        if (has(`${g} ${f}`)) return true;
        if (middles && has(`${g} ${middles} ${f}`)) return true;
        const initials = middles
          .split(" ")
          .filter(Boolean)
          .map((m) => m[0])
          .join(" ");
        if (initials && has(`${g} ${initials} ${f}`)) return true;
      }
    }
    return givens.some(
      (g) =>
        g.length >= 3 &&
        goBy.get(g) === 1 &&
        capitalised.has(g) &&
        has(g),
    );
  });
}
