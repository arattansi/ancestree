/**
 * A founder's first run on the tree they've just started (Step 29): the
 * steps, in order, and what each one looks at, read off the tree as it
 * stands. Pure, so the onboarding page, the canvas checklist and the tests
 * all agree on what "done" means.
 *
 *   invite  who'll help build it, and the account types they can have
 *   you     the founder's own entry, added or brought over from another tree
 *   name    the tree's name, if it still has the one it was planted with
 *   family  parents, partners, children and siblings, around the founder
 *
 * Only `you` is required: the canvas waits for the founder's own entry. The
 * rest can be skipped, and the canvas's "Getting started" list comes back to
 * whatever was left.
 */

import type { ConnectionEdge, PersonRef } from "@/lib/connections";

export const FIRST_TREE_STEPS = ["invite", "you", "name", "family"] as const;
export type FirstTreeStep = (typeof FIRST_TREE_STEPS)[number];

/** The steps as the progress list names them. */
export const FIRST_TREE_STEP_NAMES: Record<FirstTreeStep, string> = {
  invite: "Invite",
  you: "You",
  name: "Name",
  family: "Family",
};

export function isFirstTreeStep(value: unknown): value is FirstTreeStep {
  return (
    typeof value === "string" &&
    (FIRST_TREE_STEPS as readonly string[]).includes(value)
  );
}

/** What the steps are judged by. */
export type FirstTreeState = {
  /** The founder's own entry is shown on this tree. */
  selfPlaced: boolean;
  /** The tree still has the name it was planted with (`isDefaultTreeName`). */
  defaultName: boolean;
  /** Someone has been invited to help, or has joined. */
  invited: boolean;
  parents: number;
  partners: number;
  children: number;
  siblings: number;
};

/**
 * Where `/onboarding` opens with no step asked for: inviting first for a
 * founder who hasn't started, then their own entry; once that's on the
 * tree, naming it if it's still "Family", else their close family.
 */
export function openingStep(state: FirstTreeState): FirstTreeStep {
  if (!state.selfPlaced) return state.invited ? "you" : "invite";
  return state.defaultName ? "name" : "family";
}

/**
 * The step to show when `asked` is: naming the tree and adding family both
 * build on the founder's own entry, so without it they wait on `you`.
 */
export function reachableStep(
  asked: FirstTreeStep,
  state: FirstTreeState,
): FirstTreeStep {
  if ((asked === "name" || asked === "family") && !state.selfPlaced) {
    return "you";
  }
  return asked;
}

/**
 * The step after `step`, passing over what's already done — the founder's
 * entry once it's on the tree, a name someone already chose. `null` when
 * the canvas is next.
 */
export function stepAfter(
  step: FirstTreeStep,
  state: FirstTreeState,
): FirstTreeStep | null {
  for (let i = FIRST_TREE_STEPS.indexOf(step) + 1; i < FIRST_TREE_STEPS.length; i += 1) {
    const next = FIRST_TREE_STEPS[i];
    if (next === "you" && state.selfPlaced) continue;
    if (next === "name" && !state.defaultName) continue;
    return next;
  }
  return null;
}

/** Whether a step's work is done, for the progress list's ticks. */
export function stepDone(step: FirstTreeStep, state: FirstTreeState): boolean {
  switch (step) {
    case "invite":
      return state.invited;
    case "you":
      return state.selfPlaced;
    case "name":
      return state.selfPlaced && !state.defaultName;
    case "family":
      return state.parents + state.partners + state.children + state.siblings > 0;
  }
}

export type GettingStartedItem = {
  key: "invite" | "you" | "name" | "parents" | "more-family";
  label: string;
  done: boolean;
  /** The onboarding step that does it. */
  step: FirstTreeStep;
};

/**
 * The canvas's "Getting started" list for a founder: the same steps, with
 * the family split in two so a lone parent doesn't tick the lot.
 */
export function gettingStartedItems(state: FirstTreeState): GettingStartedItem[] {
  return [
    { key: "invite", label: "Invite someone to help", done: state.invited, step: "invite" },
    { key: "you", label: "Add yourself", done: state.selfPlaced, step: "you" },
    { key: "name", label: "Name your tree", done: !state.defaultName, step: "name" },
    { key: "parents", label: "Add your parents", done: state.parents > 0, step: "family" },
    {
      key: "more-family",
      label: "Add a partner, child or sibling",
      done: state.partners + state.children + state.siblings > 0,
      step: "family",
    },
  ];
}

/**
 * A founder's display name as a first and last name to start their own
 * entry from. The display name comes from the name they gave when they
 * asked for a tree, or from their email address when they gave none — an
 * address's "maria.garcia" is no name, so it prefills nothing.
 */
export function namePrefill(displayName: string | null | undefined): {
  first_name: string;
  last_name: string;
} {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  const looksLikeAName = parts.every((p) => /^[\p{L}\p{M}'’-]+$/u.test(p));
  if (parts.length === 0 || !looksLikeAName) {
    return { first_name: "", last_name: "" };
  }
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

/** A person as the family step shows them. */
export type FamilyCard = {
  id: string;
  name: string;
  lifespan: string | null;
  initials: string;
  photoUrl: string | null;
};

/** Someone invited onto the tree, by name and address, or to claim an entry. */
export type TreeInvite = {
  id: string;
  name: string;
  email: string;
  joinsAs: string;
  /** The entry they're invited to take over, for an invite to claim one. */
  claims: string | null;
  /** `false` when the invite email is known not to have gone. */
  emailSent: boolean | null;
};

export type FamilyLine = {
  from_person: string;
  to_person: string;
  type: string;
  is_divorced?: boolean | null;
};

/** Everyone one step from a person, by how they're related. */
export type CloseFamily = {
  parents: string[];
  partners: { id: string; isDivorced: boolean }[];
  children: string[];
  /** Sharing a parent with them, or joined by a sibling line of their own. */
  siblings: string[];
};

/** A person's close family, read off the lines a tree draws. */
export function closeFamilyOf(personId: string, lines: readonly FamilyLine[]): CloseFamily {
  const parents: string[] = [];
  const children: string[] = [];
  const partners: CloseFamily["partners"] = [];
  const siblings: string[] = [];
  const add = (list: string[], id: string) => {
    if (id !== personId && !list.includes(id)) list.push(id);
  };

  for (const line of lines) {
    if (line.type === "parent") {
      if (line.to_person === personId) add(parents, line.from_person);
      if (line.from_person === personId) add(children, line.to_person);
    } else if (line.type === "spouse") {
      const other =
        line.from_person === personId
          ? line.to_person
          : line.to_person === personId
            ? line.from_person
            : null;
      if (other && other !== personId && !partners.some((p) => p.id === other)) {
        partners.push({ id: other, isDivorced: line.is_divorced ?? false });
      }
    } else if (line.type === "sibling") {
      if (line.from_person === personId) add(siblings, line.to_person);
      if (line.to_person === personId) add(siblings, line.from_person);
    }
  }

  for (const line of lines) {
    if (line.type === "parent" && parents.includes(line.from_person)) {
      add(siblings, line.to_person);
    }
  }
  return { parents, partners, children, siblings };
}

/** The four ways the family step adds someone, relative to the founder. */
export const CLOSE_KINDS = ["parent", "partner", "child", "sibling"] as const;
export type CloseKind = (typeof CLOSE_KINDS)[number];

export type CloseRelativeLinks = {
  /** A parent: the founder's other parents to record as this one's partner. */
  partnerIds?: readonly string[];
  /** A child: the founder's partners to record as its other parent. */
  coParentIds?: readonly string[];
  /** A sibling: the founder's parents this sibling shares — all, or one for a half-sibling. */
  sharedParentIds?: readonly string[];
  /** A partner: when they married and whether they parted, already stored-shape. */
  marriage?: {
    marriage_date?: string | null;
    is_divorced?: boolean;
    divorce_date?: string | null;
  };
};

/**
 * Why a close relative can't be added as asked, or `null`. A sibling needs
 * a parent to share: the tree seats siblings side by side only under a
 * parent they have in common, and a bare sibling line isn't drawn there.
 */
export function closeRelativeProblem(
  kind: CloseKind,
  links: CloseRelativeLinks = {},
): string | null {
  if (kind === "sibling" && (links.sharedParentIds ?? []).length === 0) {
    return "Pick at least one parent you share, so they sit beside you on the tree.";
  }
  return null;
}

/**
 * The lines that join one new person — `new:0` — to the founder, and to
 * whoever else the family step says they belong with.
 */
export function closeRelativeEdges(
  kind: CloseKind,
  founderId: string,
  links: CloseRelativeLinks = {},
): ConnectionEdge[] {
  const added: PersonRef = { kind: "new", index: 0 };
  const existing = (id: string): PersonRef => ({ kind: "existing", id });
  const unique = (ids: readonly string[] | undefined) =>
    [...new Set(ids ?? [])].filter((id) => id && id !== founderId);

  switch (kind) {
    case "parent":
      return [
        { type: "parent", a: added, b: existing(founderId) },
        ...unique(links.partnerIds).map(
          (id): ConnectionEdge => ({ type: "spouse", a: existing(id), b: added }),
        ),
      ];
    case "partner":
      return [
        {
          type: "spouse",
          a: existing(founderId),
          b: added,
          marriage_date: links.marriage?.marriage_date ?? null,
          is_divorced: links.marriage?.is_divorced ?? false,
          divorce_date: links.marriage?.is_divorced
            ? (links.marriage?.divorce_date ?? null)
            : null,
        },
      ];
    case "child":
      return [
        { type: "parent", a: existing(founderId), b: added },
        ...unique(links.coParentIds).map(
          (id): ConnectionEdge => ({ type: "parent", a: existing(id), b: added }),
        ),
      ];
    case "sibling":
      return unique(links.sharedParentIds).map(
        (id): ConnectionEdge => ({ type: "parent", a: existing(id), b: added }),
      );
  }
}
