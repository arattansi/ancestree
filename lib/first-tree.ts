/**
 * A founder's first run on the tree they've just started (Step 29): the
 * steps, in order, and what each one looks at, read off the tree as it
 * stands. Pure, so the onboarding page, the canvas checklist and the tests
 * all agree on what "done" means. Since Step 161 the founder's own entry is
 * the centre of the family step, filled first, rather than a step of its own:
 *
 *   family  the founder, then parents, partners, children and siblings
 *           around them
 *   invite  who'll help build it, and the account types they can have
 *   name    the tree's name, if it still has the one it was planted with
 *
 * Only the founder's own entry is required: the canvas waits for it, and the
 * family step's other places wait on it too. The rest can be skipped, and
 * the canvas's "Getting started" list comes back to whatever was left.
 */

import type { ConnectionEdge, PersonRef } from "@/lib/connections";
import { onboardingStepHref, ownDetailsHref } from "@/lib/tree-links";

export const FIRST_TREE_STEPS = ["family", "invite", "name"] as const;
export type FirstTreeStep = (typeof FIRST_TREE_STEPS)[number];

/** The steps as the progress list names them. */
export const FIRST_TREE_STEP_NAMES: Record<FirstTreeStep, string> = {
  family: "Family",
  invite: "Invite",
  name: "The tree",
};

export function isFirstTreeStep(value: unknown): value is FirstTreeStep {
  return (
    typeof value === "string" &&
    (FIRST_TREE_STEPS as readonly string[]).includes(value)
  );
}

/**
 * The step an address's `?step=` names: `you`, a step until Step 161, is
 * the family step now, where the founder's own entry is added. `null` for
 * anything else, which opens where they left off.
 */
export function stepFromAddress(value: unknown): FirstTreeStep | null {
  if (value === "you") return "family";
  return isFirstTreeStep(value) ? value : null;
}

/** What the steps are judged by. */
export type FirstTreeState = {
  /** The founder's own entry is shown on this tree. */
  selfPlaced: boolean;
  /** Their own entry has a photo, and a place of birth (Step 161). */
  selfPhoto: boolean;
  selfBirthplace: boolean;
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
 * Where `/onboarding` opens with no step asked for: the first step not yet
 * done, or their close family once everything is. A founder not yet on
 * their tree opens on the family step, where they add themselves first.
 */
export function openingStep(state: FirstTreeState): FirstTreeStep {
  if (!state.selfPlaced) return "family";
  return FIRST_TREE_STEPS.find((step) => !stepDone(step, state)) ?? "family";
}

/**
 * The step to show when `asked` is: naming the tree builds on the founder's
 * own entry, so without it the family step, where they add it, comes first.
 */
export function reachableStep(
  asked: FirstTreeStep,
  state: FirstTreeState,
): FirstTreeStep {
  if (asked === "name" && !state.selfPlaced) return "family";
  return asked;
}

/**
 * The step after `step`, passing over a name someone already chose. `null`
 * when the canvas is next.
 */
export function stepAfter(
  step: FirstTreeStep,
  state: FirstTreeState,
): FirstTreeStep | null {
  for (let i = FIRST_TREE_STEPS.indexOf(step) + 1; i < FIRST_TREE_STEPS.length; i += 1) {
    const next = FIRST_TREE_STEPS[i];
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
    case "name":
      return state.selfPlaced && !state.defaultName;
    case "family":
      return (
        state.selfPlaced &&
        state.parents + state.partners + state.children + state.siblings > 0
      );
  }
}

export type GettingStartedItem = {
  key: "details" | "parents" | "more-family" | "invite" | "name";
  label: string;
  done: boolean;
  /** Where it's done: the onboarding step, or their own entry's blanks. */
  href: string;
};

/**
 * The canvas's "Getting started" list for a founder, in the steps' order:
 * their own photo and birthplace first (Step 161), which the short form on
 * the family step leaves for later, then the family split in two so a lone
 * parent doesn't tick the lot.
 */
export function gettingStartedItems(state: FirstTreeState): GettingStartedItem[] {
  return [
    {
      key: "details",
      label: "Add your photo and birthplace",
      done: state.selfPhoto && state.selfBirthplace,
      href: ownDetailsHref(),
    },
    {
      key: "parents",
      label: "Add your parents",
      done: state.parents > 0,
      href: onboardingStepHref("family"),
    },
    {
      key: "more-family",
      label: "Add a partner, child or sibling",
      done: state.partners + state.children + state.siblings > 0,
      href: onboardingStepHref("family"),
    },
    {
      key: "invite",
      label: "Invite someone to help",
      done: state.invited,
      href: onboardingStepHref("invite"),
    },
    {
      key: "name",
      label: "Name your tree",
      done: !state.defaultName,
      href: onboardingStepHref("name"),
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
  /** A parent: the founder's siblings with no parent yet who are theirs too
   *  (Step 125). */
  alsoParentOf?: readonly string[];
  /** A sibling added before any parent (Step 125): the founder's other
   *  siblings with no parent, who are this one's too. */
  siblingIds?: readonly string[];
  /** A child: the founder's partners to record as its other parent. */
  coParentIds?: readonly string[];
  /** A sibling: the founder's parents this sibling shares — all, or one for a half-sibling. */
  sharedParentIds?: readonly string[];
  /** A partner: when they married and whether they parted, already stored-shape. */
  marriage?: {
    marriage_date?: string | null;
    marriage_month?: number | null;
    marriage_day?: number | null;
    is_divorced?: boolean;
    divorce_date?: string | null;
  };
};

/**
 * Why a close relative can't be added as asked, or `null`. Once the founder
 * has a parent on the tree, a sibling shares at least one of them: one who
 * shares none would have no parent of theirs to sit under. Before any
 * parent, a sibling is joined by a sibling line alone, and the tree seats
 * them together all the same (Step 125).
 */
export function closeRelativeProblem(
  kind: CloseKind,
  links: CloseRelativeLinks = {},
  { parentsOnTree = 0 }: { parentsOnTree?: number } = {},
): string | null {
  if (
    kind === "sibling" &&
    parentsOnTree > 0 &&
    (links.sharedParentIds ?? []).length === 0
  ) {
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
        ...unique(links.alsoParentOf).map(
          (id): ConnectionEdge => ({ type: "parent", a: added, b: existing(id) }),
        ),
      ];
    case "partner":
      return [
        {
          type: "spouse",
          a: existing(founderId),
          b: added,
          marriage_date: links.marriage?.marriage_date ?? null,
          marriage_month: links.marriage?.marriage_month ?? null,
          marriage_day: links.marriage?.marriage_day ?? null,
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
    case "sibling": {
      const shared = unique(links.sharedParentIds);
      if (shared.length > 0) {
        return shared.map(
          (id): ConnectionEdge => ({ type: "parent", a: existing(id), b: added }),
        );
      }
      // No parent yet (Step 125): a sibling line to the founder, and to
      // their other siblings with none, so the whole group is joined.
      return [founderId, ...unique(links.siblingIds)].map(
        (id): ConnectionEdge => ({ type: "sibling", a: existing(id), b: added }),
      );
    }
  }
}
