/**
 * Carrying a family line onto another tree (Step 80): who "All descendants
 * of" picks, and what bringing each of them over asks. Pure, so the picker
 * can answer as the Root types; `place_people` has the last word.
 */

/**
 * What bringing someone over asks: nothing, the yes of the member whose
 * entry it is, or the yes of whoever may edit it on its home tree. Mirrors
 * `public.placement_preview`.
 */
export type CarryAsk = "none" | "owner" | "stewards";

export function isCarryAsk(value: unknown): value is CarryAsk {
  return value === "none" || value === "owner" || value === "stewards";
}

/** Someone the Root can see on a tree they belong to. */
export type CarryPerson = {
  id: string;
  name: string;
  lifespan: string | null;
  /** The trees the Root can see them on. */
  fromTrees: string[];
  /** On this tree already: there to pick a line from, not to bring. */
  here: boolean;
  asks: CarryAsk;
};

export type CarryLine = {
  from_person: string;
  to_person: string;
  type: string;
};

/**
 * Everyone "All descendants of" means: the person picked, then everyone
 * descended from them down every parent line, a generation at a time. With
 * `partners`, each is followed by whoever they married or had a child with,
 * so a family hangs from both its parents; a partner's own family stays out.
 * Sibling lines aren't followed, as on the canvas's "Only descendants of"
 * (`descendantIds`): a brother recorded without the parents he shares isn't
 * known to descend from them.
 */
export function lineOf(
  rootId: string,
  lines: readonly CarryLine[],
  { partners }: { partners: boolean },
): string[] {
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const spouses = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key);
    if (!list) map.set(key, [value]);
    else if (!list.includes(value)) list.push(value);
  };
  for (const l of lines) {
    if (l.type === "parent") {
      add(children, l.from_person, l.to_person);
      add(parents, l.to_person, l.from_person);
    } else if (l.type === "spouse") {
      add(spouses, l.from_person, l.to_person);
      add(spouses, l.to_person, l.from_person);
    }
  }

  const blood = new Set<string>([rootId]);
  const generations: string[][] = [[rootId]];
  for (let at = 0; at < generations.length; at += 1) {
    const next: string[] = [];
    for (const id of generations[at]) {
      for (const child of children.get(id) ?? []) {
        if (blood.has(child)) continue;
        blood.add(child);
        next.push(child);
      }
    }
    if (next.length > 0) generations.push(next);
  }

  const line: string[] = [];
  const seen = new Set<string>();
  const take = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    line.push(id);
  };
  for (const generation of generations) {
    for (const id of generation) {
      take(id);
      if (!partners) continue;
      for (const spouse of spouses.get(id) ?? []) take(spouse);
      // The other parent of their children, married or not.
      for (const child of children.get(id) ?? []) {
        for (const parent of parents.get(child) ?? []) take(parent);
      }
    }
  }
  return line;
}

export type CarryCounts = { full: number; owner: number; stewards: number };

/** How many of those picked come over whole, and how many wait on whom. */
export function carryCounts(
  people: readonly Pick<CarryPerson, "asks">[],
): CarryCounts {
  const counts: CarryCounts = { full: 0, owner: 0, stewards: 0 };
  for (const p of people) {
    if (p.asks === "owner") counts.owner += 1;
    else if (p.asks === "stewards") counts.stewards += 1;
    else counts.full += 1;
  }
  return counts;
}

/** Under a name in the picker: what bringing them over asks. */
export function carryAskNote(asks: CarryAsk): string {
  if (asks === "owner") return "Basic until they approve";
  if (asks === "stewards") return "Basic until a Root or Branch approves";
  return "In full";
}

/**
 * Where a card would say when someone lived, what a basic card says
 * instead: the tree doesn't know, so it mustn't say "Living".
 */
export const BASIC_DETAILS = "Basic details";

/**
 * How long an ask waits (Step 83): one reminder goes out after the first,
 * and after the second it lapses, leaving the basic card. Mirrors
 * `private.placement_nudge_due` and `private.placement_approval_now`.
 */
export const REMIND_AFTER_DAYS = 7;
export const LAPSE_AFTER_DAYS = 30;

/**
 * Where a yes stands, as a tree reads it: `none` when there was nothing to
 * ask, `lapsed` once an ask has waited `LAPSE_AFTER_DAYS` unanswered.
 */
export type CarryApproval =
  | "none"
  | "asked"
  | "approved"
  | "declined"
  | "lapsed";

export function carryApprovalOf(value: unknown): CarryApproval {
  return value === "asked" ||
    value === "approved" ||
    value === "declined" ||
    value === "lapsed"
    ? value
    : "none";
}

/** Whether a tree shows only the basic card while the yes stands there. */
export function showsBasic(approval: CarryApproval): boolean {
  return approval === "asked" || approval === "declined" || approval === "lapsed";
}

/**
 * What a basic card waits on, for its details sheet and the Root's list:
 * `name` is the person's own, for the member who is asked themselves.
 */
export function waitingOn(
  approval: CarryApproval,
  askedOf: "owner" | "stewards" | null,
  name: string,
): string | null {
  if (approval === "asked") {
    return askedOf === "owner"
      ? `Waiting for ${name} to approve.`
      : "Waiting for a Root or Branch of their home tree to approve.";
  }
  if (approval === "lapsed") {
    return askedOf === "owner"
      ? `${name} hasn’t answered.`
      : "Their home tree hasn’t answered.";
  }
  if (approval === "declined") {
    return askedOf === "owner"
      ? `${name} declined to show more.`
      : "Their home tree declined to show more.";
  }
  return null;
}

/** Under a name in the Root's list: what the tree shows, and why. */
export function carriedNote(
  approval: CarryApproval,
  askedOf: "owner" | "stewards" | null,
): string | null {
  if (approval === "asked") {
    return askedOf === "owner"
      ? "Basic · waiting for them"
      : "Basic · waiting for a Root or Branch";
  }
  if (approval === "declined") return "Basic · declined";
  if (approval === "lapsed") return "Basic · no answer";
  return null;
}

/** What a call to `place_people` did, as the toast says it. */
export function carriedSummary(
  placed: readonly { approval: string }[],
): string {
  const basic = placed.filter((p) =>
    showsBasic(carryApprovalOf(p.approval)),
  ).length;
  const full = placed.length - basic;
  return [
    full > 0 ? `${full} in full` : null,
    basic > 0 ? `${basic} basic until approved` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
