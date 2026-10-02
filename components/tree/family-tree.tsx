"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  useStoreApi,
  useUpdateNodeInternals,
  type Edge,
  type NodeMouseHandler,
  type OnNodeDrag,
  type ReactFlowState,
} from "@xyflow/react";
import { LocateFixed, Route } from "lucide-react";
import { toast } from "sonner";

import "@xyflow/react/dist/style.css";

import { autoArrangeTree, setPersonPosition } from "@/app/actions/people";
import { setPetPosition } from "@/app/actions/pets";
import { ConfirmButton } from "@/components/confirm-dialog";
import { lazyComponent, useLoadedSoon } from "@/components/lazy-component";
import { RequestInviteDialog } from "@/components/request-invite-dialog";
import { AddRelativeButton } from "@/components/tree/add-relative-button";
import { FamilyAddButton, type FamilyAdd } from "@/components/tree/add-to-tree";
import { buildPeopleGraph, withPets } from "@/components/tree/build-graph";
import { ColumnsIcon, ExpandingLabel } from "@/components/tree/canvas-controls";
import { edgeTypes } from "@/components/tree/canvas-edges";
import { FoldedDetails } from "@/components/tree/folded-details";
import { GenerationLane } from "@/components/tree/generation-lane";
import {
  canHover,
  OffSpotlightPill,
  useHoverStore,
  type HoverSummary,
} from "@/components/tree/off-spotlight-pill";
import {
  SPOTLIGHT_BROWN,
  SPOTLIGHT_GREEN,
} from "@/components/tree/spotlight-colours";
import { useIsPhone, useIsSm } from "@/components/tree/use-is-phone";
import { CanvasTip } from "@/components/tree/canvas-tip";
import { ClaimSuggestions } from "@/components/tree/claim-suggestions";
import { GettingStarted } from "@/components/tree/getting-started";
import { bladeTop } from "@/components/tree/leaf-card";
import { PersonNode } from "@/components/tree/person-node";
import { PetNode } from "@/components/tree/pet-node";
import {
  SamePersonPrompt,
  samePersonLabel,
} from "@/components/tree/same-person";
import { TreeKey, type CardMark } from "@/components/tree/tree-mark";
import { PersonPicker } from "@/components/tree/person-picker";
import {
  NO_CONNECTION,
  TreeSearch,
  type ConnectionEnds,
} from "@/components/tree/tree-search";
import { UpcomingFeed } from "@/components/tree/upcoming-feed";
import { markPersonSheetsStale } from "@/components/tree/use-person-sheet";
import { useNotSame } from "@/components/tree/use-not-same";
import { useShowCompanions } from "@/components/tree/use-show-companions";
import { useToday } from "@/components/tree/use-today";
import { useTreeRoom } from "@/components/tree/use-tree-room";
import {
  NOT_READ,
  rememberCanvas,
  useCanvasMemory,
} from "@/components/tree/use-canvas-memory";
import { LiveCursors, PresenceFaces } from "@/components/tree/live-cursors";
import type { CanvasMemory } from "@/lib/canvas-memory";
import { countOf, plural } from "@/lib/plural";
import {
  EMPTY_FILTER,
  isFilterActive,
  matchesFilter,
  petMatchesFilter,
  type TreeFilter,
} from "@/lib/tree-search";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/use-action";
import { accountTypeOf } from "@/lib/account-types";
import { isRedirect, UNREACHABLE } from "@/lib/action-feedback";
import {
  branchReach,
  canAddRelativeOf,
  canEditCompanion,
  canEditConnection,
  canInviteToClaimCard,
  canInviteToClaimHere,
  canOfferDeleteHere,
  descendantIds,
  entryRights,
  lineIds,
  ownRoots,
  rootSideIds,
  viewerOnTree,
  type EntrySubject,
  type TreeAccess,
  type Viewer,
} from "@/lib/branch";
import type { EntryInvite } from "@/lib/claim-invites";
import { mergeConfirmation, relativesThatMove } from "@/lib/claim-merge";
import type { ClaimCandidate } from "@/lib/claims";
import { connectionLabel, connectionPath, relationOf } from "@/lib/connection-path";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import type { GettingStartedItem } from "@/lib/first-tree";
import { generationLabelFromYou } from "@/lib/generation-lanes";
import {
  addTreesFromView,
  lineEditableFromView,
  marriedInLabel,
  type FamilyActingTree,
  type FamilyLine,
  type FamilyShowing,
  type MarriedIn,
} from "@/lib/my-family";
import { nativeLeaf } from "@/lib/native-leaf";
import { upcomingOccasions } from "@/lib/occasions";
import { asDayMonth } from "@/lib/partial-date";
import { petYears, speciesLabel } from "@/lib/pet-labels";
import { personSpotlight, spotlightPeople } from "@/lib/person-spotlight";
import {
  pairKey,
  samePeopleById,
  type SamePair,
} from "@/lib/same-person";
import type { DeclinedSuggestion, EntrySuggestion } from "@/lib/suggestions";
import { onboardingHref } from "@/lib/tree-links";
import { cn } from "@/lib/utils";
import { descentGeometry, type CardRect } from "@/lib/edge-geometry";
import { NODE_H, NODE_W, type XY } from "@/lib/tree-dimensions";
import { bloodline, layoutTree } from "@/lib/tree-layout";
import type { TreePet } from "@/lib/pets";
import { keepEntries, keepNodes, keepSet } from "@/lib/canvas-nodes";
import {
  type Placement,
  dropCard,
  dropSaved,
  dropsSnapshot,
  dropUndone,
  NO_DROPS,
  pageNumber,
  placeDrops,
  subscribeDrops,
} from "@/lib/local-drops";
import { keptPhotoUrl } from "@/lib/signed-url";
import { shareEqual } from "@/lib/structural-share";
import { useKept } from "@/components/tree/use-kept";
import {
  personDisplayName,
  personHasDied,
  personLifespan,
} from "@/lib/person-name";
import { tagPersonOf } from "@/lib/tag-person";
import {
  anchorPoint,
  placePoint,
  presenceColours,
  type Peer,
} from "@/lib/presence";
import type { TreeGraphEdge, TreeGraphPerson } from "@/lib/tree";
import type { PersonRelation } from "@/components/tree/person-family";

const nodeTypes = { person: PersonNode, pet: PetNode };

// The details sheets aren't needed to draw the tree, so their code comes
// once it has painted (Step 87.4, audit C1), and they're mounted, closed,
// from then on, so a card opens its sheet as it always did.
const PersonPanel = lazyComponent(() =>
  import("@/components/tree/person-panel").then((m) => m.PersonPanel),
);
const PetPanel = lazyComponent(() =>
  import("@/components/tree/pet-panel").then((m) => m.PetPanel),
);
const preloadPanels = () =>
  Promise.all([PersonPanel.preload(), PetPanel.preload()]);
// A `?person=` link opens its sheet with the canvas: that code is asked for
// as this script runs, alongside the page's own.
if (
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("person")
) {
  PersonPanel.preload().catch(() => {});
}

const NO_PETS: TreePet[] = [];
const NO_INVITES: EntryInvite[] = [];
const NO_SUGGESTIONS: EntrySuggestion[] = [];
const NO_DECLINED: DeclinedSuggestion[] = [];
const NO_PANEL_SUGGESTIONS: PanelSuggestion[] = [];
const NO_RELATIONS: PersonRelation[] = [];
const NO_HOME_TREES: TreeAccess[] = [];
const NOBODY: ReadonlySet<string> = new Set();
/** Every line lit, as My Family Tree rests. */
const ALL: Pick<ReadonlySet<string>, "has"> = { has: () => true };
const NO_SAME: ReadonlyMap<string, string[]> = new Map();
/**
 * What the camera is framing once it's put back where this tab left it
 * (Step 77.3): whatever is on the canvas as it opens. Never a person's id.
 */
const KEPT_VIEW = "(kept view)";

/**
 * My Family Tree (Step 92.2): the viewer's trees gathered into one view.
 * Its cards wear their tree's mark, a key names the trees, and nothing is
 * dragged or added on it: each card's actions go to its own tree, as who
 * the viewer is there (Step 92.3).
 */
export type FamilyView = {
  /** The viewer's trees, in the key's order, with who they are on each. */
  trees: FamilyActingTree[];
  /** The tree the browser is looking at, for the sheet's links to theirs. */
  currentTreeId: string | null;
  /** Cards that may be one person entered twice (Step 92.4), and what
   *  each pair stands on: asked "Same person?" here only. */
  samePeople: readonly SamePair[];
  /** Everyone who married into the viewer's family, and whom (Step 94):
   *  drawn as pills. Everyone else is a direct relative, on a card. */
  marriedIn: readonly MarriedIn[];
  /** The viewer's own spouses (Step 94.1): married in, but a card beside
   *  them that says "Your spouse". */
  spouseIds: readonly string[];
};

type Props = {
  /** On My Family Tree, each says which of the viewer's trees show them. */
  people: (TreeGraphPerson & Partial<FamilyShowing>)[];
  /** On My Family Tree, each says which tree it was drawn on. */
  relationships: (TreeGraphEdge &
    Partial<Pick<FamilyLine, "drawn_on_tree_id">>)[];
  treeId: string;
  /** The tree's URL slug, for a read-only canvas's "Ask to join" (Step 41.4). */
  treeSlug: string;
  selfPersonId: string | null;
  /** The founding admins' entries — the tree is centred on them. */
  anchorIds: string[];
  /** Every Root's entry: a Branch tends their part of the side of the one they're related to. */
  rootIds: string[];
  currentUserId: string;
  isAdmin: boolean;
  /** The viewer's `profiles.role`; `lib/account-types` says what it reaches. */
  role: string;
  /**
   * Entries that belong to the people they describe — other members' own
   * entries and settled claims. A branch admin edits around these.
   */
  spokenForIds: string[];
  claimCandidates: ClaimCandidate[];
  panelSuggestions: PanelSuggestion[];
  /** Companion animals, hung off the people they belong to (never relatives). */
  pets: TreePet[];
  /**
   * Render the canvas without any editing controls: a share link, or a
   * visitor from another tree (Step 25.4), who is signed in.
   */
  readOnly?: boolean;
  /**
   * The share link being viewed, if this is one: its cards ask whose land a
   * place is through it, since its viewer isn't signed in (Step 27.9).
   */
  shareToken?: string;
  /** A visitor from another tree (Step 25.4): said once, above the canvas. */
  visitorNote?: string | null;
  /** What's left of the founder's first run (Step 29), for the tree's founder. */
  gettingStarted?: GettingStartedItem[] | null;
  /**
   * Invites out to claim entries here, for their cards to say who sent one
   * (Step 38). A member's canvas only: never a share link's or a visitor's.
   */
  claimInvites?: EntryInvite[];
  /**
   * Suggested changes still waiting that the viewer can see (Step 67): on
   * entries they may edit, to answer, and their own. A member's canvas only.
   */
  changeSuggestions?: EntrySuggestion[];
  /** The viewer's own suggestions that were declined (Step 72). */
  declinedSuggestions?: DeclinedSuggestion[];
  /** Drawn as My Family Tree rather than one tree (Step 92.2). */
  family?: FamilyView | null;
  /**
   * Who the viewer is on the other trees of theirs that are home to people
   * here (Step 93): an entry's details follow its home tree's rules, not
   * this tree's. A member's canvas only.
   */
  homeTrees?: TreeAccess[];
};

/**
 * How the camera moves when a click aims it: as the cards do (`.tree-pulled`
 * in globals.css: 560ms, ease-out quint), so the two travel together, and
 * straight there. The default eases in, swoops out and back in on a long
 * move, and arrives well after the cards.
 */
const CAMERA = {
  duration: 560,
  ease: (t: number) => 1 - (1 - t) ** 5,
  interpolate: "linear",
} as const;

/** Which way a bloodline spotlight runs from the person who was clicked. */
type BloodlineDirection = "up" | "down";

/** A spotlighted connection: the edge, and the direction the click chose. */
type SelectedEdge = { id: string; direction: BloodlineDirection };

function Canvas({
  people,
  relationships,
  treeId,
  treeSlug,
  selfPersonId,
  anchorIds,
  rootIds,
  currentUserId,
  isAdmin,
  role,
  spokenForIds,
  claimCandidates,
  panelSuggestions,
  pets: allPets,
  readOnly = false,
  shareToken,
  gettingStarted = null,
  claimInvites = NO_INVITES,
  changeSuggestions = NO_SUGGESTIONS,
  declinedSuggestions = NO_DECLINED,
  family = null,
  homeTrees = NO_HOME_TREES,
  page,
}: Props & { page: number }) {
  // My Family Tree moves nothing and adds nothing itself (Step 92.2): no
  // drag, nobody else's pointers, and none of one tree's rules. Each card's
  // actions go to its own tree, as who the viewer is there (Step 92.3,
  // `viewerOn` below).
  const editable = !readOnly && !family;
  // And it rests in a spotlight's look: everyone a leaf on brown branches,
  // whoever married in a pill, laid out as a pulled-out line is. Clicking
  // someone still pulls their own line forward, the rest blurred back.
  const allLeaves = !!family;
  // It's the viewer's own family tree (Step 94): their blood on cards, and
  // whoever married into it as a pill, a sibling's partner's shape in a
  // spotlight (Step 19.4), wherever they stand on the view.
  const marriedIn = React.useMemo(
    () => new Map((family?.marriedIn ?? []).map((m) => [m.id, m])),
    [family],
  );
  const pillIds = React.useMemo<ReadonlySet<string>>(
    () => (marriedIn.size > 0 ? new Set(marriedIn.keys()) : NOBODY),
    [marriedIn],
  );
  // Their own spouse is a card beside them, and says so (Step 94.1).
  const spouseIds = React.useMemo<ReadonlySet<string>>(
    () => (family?.spouseIds.length ? new Set(family.spouseIds) : NOBODY),
    [family],
  );
  // Companions stay off the canvas until the viewer switches them on (Step
  // 23). Off the canvas only: a person's details still list theirs, and
  // picking one there still opens it.
  const [showCompanions, setShowCompanions] = useShowCompanions();
  const pets = showCompanions ? allPets : NO_PETS;
  const claimableIds = React.useMemo(
    () => new Set(claimCandidates.map((c) => c.id)),
    [claimCandidates],
  );
  // "This is me" merges the member's own entry into the one they pick, so it
  // asks first, naming who moves (Step 36).
  const claimNotes = React.useMemo(
    () =>
      new Map(
        claimCandidates.map((c) => [
          c.id,
          mergeConfirmation(
            selfPersonId
              ? relativesThatMove(selfPersonId, c.id, people, relationships)
              : [],
          ),
        ]),
      ),
    [claimCandidates, selfPersonId, people, relationships],
  );
  // Only the viewer's Root's side (Step 48): the people on it and the lines
  // between them, laid out again around that Root. Offered only when it
  // leaves somebody out. Permissions and a person's own details still read
  // the whole tree; only what the canvas draws, searches and lights is cut.
  const rootSide = React.useMemo(() => {
    if (!selfPersonId) return null;
    const ids = rootSideIds(selfPersonId, rootIds, relationships);
    if (!ids.has(selfPersonId) || people.every((p) => ids.has(p.id)))
      return null;
    return { ids, anchorIds: ownRoots(selfPersonId, rootIds, relationships) };
  }, [selfPersonId, rootIds, relationships, people]);
  const [sideOnly, setSideOnly] = React.useState(false);
  const side = sideOnly ? rootSide : null;
  const sidePeople = React.useMemo(
    () => (side ? people.filter((p) => side.ids.has(p.id)) : people),
    [people, side],
  );
  const sideRelationships = React.useMemo(
    () =>
      side
        ? relationships.filter(
            (r) => side.ids.has(r.from_person) && side.ids.has(r.to_person),
          )
        : relationships,
    [relationships, side],
  );
  // Only the descendants of one or two people (Step 57.2), within the side
  // when that's on too: them, their descendants and whom those married, laid
  // out around them. Like the side, it cuts only what the canvas draws,
  // searches and lights, and comes back with the canvas (Step 77.3).
  const [descendantsOf, setDescendantsOf] = React.useState<string[]>([]);
  const descent = React.useMemo(() => {
    const onSide = new Set(sidePeople.map((p) => p.id));
    const roots = descendantsOf.filter((id) => onSide.has(id));
    if (roots.length === 0) return null;
    return { ids: descendantIds(roots, sideRelationships), anchorIds: roots };
  }, [descendantsOf, sidePeople, sideRelationships]);
  const shownPeople = React.useMemo(
    () =>
      descent ? sidePeople.filter((p) => descent.ids.has(p.id)) : sidePeople,
    [sidePeople, descent],
  );
  const shownRelationships = React.useMemo(
    () =>
      descent
        ? sideRelationships.filter(
            (r) =>
              descent.ids.has(r.from_person) && descent.ids.has(r.to_person),
          )
        : sideRelationships,
    [sideRelationships, descent],
  );
  const sideAnchorIds = side ? side.anchorIds : anchorIds;
  // A row keeps the number, and so the name, it has on the canvas without
  // the descendants filter, however few of it are left, or the people picked
  // would always read as the founders' generation.
  const rows = React.useMemo(
    () =>
      descent
        ? layoutTree(sidePeople, sideRelationships, {
            anchorIds: sideAnchorIds,
          }).generations
        : undefined,
    [descent, sidePeople, sideRelationships, sideAnchorIds],
  );
  // Cards dropped in this tab are laid out where they were dropped until the
  // page knows it (Step 87.3): saving a drop doesn't draw the page again.
  const drops = React.useSyncExternalStore(
    subscribeDrops,
    dropsSnapshot,
    () => NO_DROPS,
  );
  // Kept as the same rows when a later page brings the drop saved, so the
  // card isn't laid out or drawn again for it.
  const placedPeople = useKept(
    React.useMemo(
      () => placeDrops(shownPeople, drops, treeId, page),
      [shownPeople, drops, treeId, page],
    ),
    shareEqual,
  );
  const placedPets = useKept(
    React.useMemo(
      () => placeDrops(pets, drops, treeId, page),
      [pets, drops, treeId, page],
    ),
    shareEqual,
  );
  // The people are laid out apart from their companions, so switching
  // companions on or off only hangs them on or takes them off (Step 87.1).
  const peopleGraph = React.useMemo(
    () =>
      buildPeopleGraph(
        placedPeople,
        shownRelationships,
        selfPersonId,
        descent ? descent.anchorIds : sideAnchorIds,
        rows,
        pillIds.size > 0 ? pillIds : undefined,
        allLeaves,
      ),
    [
      placedPeople,
      shownRelationships,
      selfPersonId,
      descent,
      sideAnchorIds,
      rows,
      pillIds,
      allLeaves,
    ],
  );
  const graph = React.useMemo(
    () => withPets(peopleGraph, placedPets),
    [peopleGraph, placedPets],
  );
  const shownIds = useKept(
    React.useMemo<ReadonlySet<string>>(
      () => new Set(shownPeople.map((p) => p.id)),
      [shownPeople],
    ),
    keepSet,
  );
  const nameById = React.useMemo(
    () => new Map(people.map((p) => [p.id, personDisplayName(p)])),
    [people],
  );

  // Who the viewer is for permission purposes. A Branch tends the part of a
  // Root's side they're related through, and a Leaf grows their own line, both
  // worked out from the edges already on the canvas — `lib/branch` mirrors
  // `private.own_branch_ids` and `private.line_ids`, which are what decide.
  // Either fills in what's missing on their own line (Step 44).
  // On My Family Tree nobody is anyone on the view itself: who they are is
  // read per tree (`viewerOn`), so the walks are skipped.
  const isFamily = !!family;
  const viewer = React.useMemo<Viewer>(() => {
    const type = accountTypeOf(role);
    const ownLine =
      type.entries !== "tree" && selfPersonId && !isFamily
        ? lineIds(selfPersonId, relationships)
        : null;
    return {
      userId: currentUserId,
      role,
      selfPersonId,
      branch:
        type.entries === "branch" && selfPersonId && !isFamily
          ? branchReach(selfPersonId, rootIds, relationships)
          : null,
      line: type.addRelatives === "line" ? ownLine : null,
      ownLine,
    };
  }, [currentUserId, role, selfPersonId, rootIds, relationships, isFamily]);
  // Who the viewer is on each of their trees, on My Family Tree (Step
  // 92.3): what each card's sheet offers is decided on the card's own tree,
  // and a line's on the tree it was drawn on.
  const viewers = React.useMemo(
    () =>
      new Map(
        (family?.trees ?? []).map((t) => [
          t.id,
          viewerOnTree(t, currentUserId, selfPersonId),
        ]),
      ),
    [family, currentUserId, selfPersonId],
  );
  const viewerOn = React.useCallback(
    (treeId: string) => viewers.get(treeId) ?? null,
    [viewers],
  );
  // On a tree, who they are on the other trees of theirs that are home to
  // people here (Step 93).
  const homeViewers = React.useMemo(
    () =>
      new Map(
        homeTrees.map((t) => [
          t.id,
          viewerOnTree(t, currentUserId, selfPersonId),
        ]),
      ),
    [homeTrees, currentUserId, selfPersonId],
  );
  // Who the viewer is on someone's home tree, whose rules their details
  // follow (`private.can_edit_person`), or `null` when they aren't on it.
  // On a tree, this tree when it's their home, else one of the viewer's
  // others; on My Family Tree, the card's tree when that's their home (a
  // card comes from its home tree whenever the viewer is on it). A basic
  // card says nothing of its home.
  const homeViewerOf = React.useCallback(
    (person: TreeGraphPerson & Partial<FamilyShowing>): Viewer | null => {
      if (person.is_home) {
        return isFamily ? viewerOn(person.tree_id ?? "") : viewer;
      }
      if (isFamily || person.basic) return null;
      return homeViewers.get(person.home_tree_id) ?? null;
    },
    [isFamily, viewerOn, viewer, homeViewers],
  );
  const spokenFor = React.useMemo(() => new Set(spokenForIds), [spokenForIds]);
  // On My Family Tree, who has an account (Step 97.3): the viewer, other
  // members' own entries and settled claims, and anyone a tree names a
  // Root, Branch or Leaf. Their leaves wear the member mark, where a
  // tree's canvas shows the account type.
  const memberIds = React.useMemo<ReadonlySet<string> | null>(
    () =>
      isFamily
        ? new Set([
            ...spokenForIds,
            ...(selfPersonId ? [selfPersonId] : []),
            ...people.flatMap((p) => (p.account_type ? [p.id] : [])),
          ])
        : null,
    [isFamily, spokenForIds, selfPersonId, people],
  );
  // A placeholder child's parents (Step 98.2): it's theirs alone.
  const placeholderParentsOf = React.useMemo(() => {
    const placeholders = new Set(
      people.flatMap((p) => (p.placeholder_number != null ? [p.id] : [])),
    );
    const parents = new Map<string, string[]>();
    if (placeholders.size === 0) return parents;
    for (const r of relationships)
      if (r.type === "parent" && placeholders.has(r.to_person))
        parents.set(r.to_person, [
          ...(parents.get(r.to_person) ?? []),
          r.from_person,
        ]);
    return parents;
  }, [people, relationships]);
  const waitingParents = React.useMemo(
    () => new Set([...placeholderParentsOf.values()].flat()),
    [placeholderParentsOf],
  );
  const entrySubject = React.useCallback(
    (person: TreeGraphPerson): EntrySubject => ({
      id: person.id,
      owner_user_id: person.owner_user_id,
      created_by: person.created_by,
      isClaimed: person.claim_status === "approved",
      isSomeoneElsesOwn: spokenFor.has(person.id),
      isDeceased: personHasDied(person),
      placeholderParents:
        person.placeholder_number != null
          ? (placeholderParentsOf.get(person.id) ?? [])
          : null,
      waitingPlaceholderParent: waitingParents.has(person.id),
    }),
    [spokenFor, placeholderParentsOf, waitingParents],
  );

  const personById = React.useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );
  // Whether their details are the viewer's to edit, by their home tree's
  // rules (Step 93), wherever the card is shown.
  const canEditPersonId = React.useCallback(
    (id: string) => {
      const person = personById.get(id);
      return (
        !!person &&
        entryRights(entrySubject(person), homeViewerOf(person), selfPersonId)
          .canEdit
      );
    },
    [personById, entrySubject, homeViewerOf, selfPersonId],
  );
  // Cards whose move the database would refuse. They aren't offered as
  // draggable at all — dragging one pans the canvas — instead of moving under
  // the pointer and being refused on drop. A Root of this tree moves any
  // card on it; anyone else, a card whose entry they may edit
  // (`tree_placements_update`).
  const lockedIds = React.useMemo(() => {
    const locked = new Set<string>();
    if (!editable) return locked;
    const movesAll = accountTypeOf(viewer.role).runsTree;
    for (const person of people)
      if (!movesAll && !canEditPersonId(person.id)) locked.add(person.id);
    for (const pet of pets)
      if (!canEditCompanion(pet, viewer, canEditPersonId)) locked.add(pet.id);
    return locked;
  }, [editable, people, pets, viewer, canEditPersonId]);

  // A locked card is seeded with `draggable: false` — only ever `false`: a
  // node's own `true` would override `nodesDraggable={false}` and let cards
  // move while a tree is pulled out. Seeding it here rather than layering it
  // on per render keeps each card the same object through someone else's
  // drag, so only the card being dragged re-renders. The canvas starts from
  // these too, so a Leaf's or a Branch's isn't seeded twice (Step 87.1).
  const seeded = React.useMemo(
    () =>
      lockedIds.size === 0
        ? graph.nodes
        : graph.nodes.map((n) =>
            lockedIds.has(n.id) ? { ...n, draggable: false } : n,
          ),
    [graph, lockedIds],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(seeded);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  // `/tree?person=<id>` opens the canvas on one entry — where the "View on
  // tree" button on a notification points. The panel opens on the first render
  // rather than through an effect; only the camera move has to wait (below).
  const focusId = useSearchParams().get("person");
  const focusable =
    focusId && people.some((p) => p.id === focusId) ? focusId : null;
  const [selectedId, setSelectedId] = React.useState<string | null>(focusable);
  // The details minimized to a card on the canvas (Step 49), so the tree
  // they belong to has the canvas to itself. It holds while the reader goes
  // from one person to the next, and goes once nobody's open.
  const [minimized, setMinimized] = React.useState(false);
  if (minimized && !selectedId) setMinimized(false);
  // The card's button, which takes focus from the sheet as it goes.
  const foldedRef = React.useRef<HTMLButtonElement>(null);
  // Followed each time the address names somebody new, not once per mount
  // (Step 19.2): after an add the new entry can arrive a render after the
  // canvas does, and a link or Back can point a canvas that is already open
  // at someone else. The address follows whoever is open too (Step 77.3,
  // below), so it naming the person already open is nothing to follow, and
  // closing the panel doesn't re-open it.
  const [seededFocus, setSeededFocus] = React.useState(focusable);
  if (focusable !== seededFocus) {
    setSeededFocus(focusable);
    if (focusable && focusable !== selectedId) {
      setSelectedId(focusable);
      // Sent here to see somebody: their details open in full.
      setMinimized(false);
      // Pointed at somebody the filters leave off (the Root's side, or the
      // descendants picked): the whole tree comes back, so their card is
      // there to open.
      if (!shownIds.has(focusable)) {
        setSideOnly(false);
        setDescendantsOf([]);
      }
    } else if (!focusId && selectedId) {
      // Sent to the tree itself, naming nobody — its link in the header,
      // or Back to before somebody was opened: whoever was open closes.
      setSelectedId(null);
    }
  }
  const [selectedPetId, setSelectedPetId] = React.useState<string | null>(null);
  // The spotlighted connection, plus which way along it the click pointed.
  const [selectedEdgeId, setSelectedEdgeId] =
    React.useState<SelectedEdge | null>(null);
  const [filter, setFilter] = React.useState<TreeFilter>(EMPTY_FILTER);
  // The two people whose connection is lit, once both are picked — from the
  // filters card, or from the prompt a searched-for person's details carry.
  const [connectionEnds, setConnectionEnds] =
    React.useState<ConnectionEnds>(NO_CONNECTION);
  // Whoever was last opened from a search result: their details offer to show
  // how they are connected to somebody else.
  const [searchedId, setSearchedId] = React.useState<string | null>(null);

  // How this tab left the canvas last time (Step 77.3), brought back once as
  // it opens: after hydration on a page load, since the server can't see the
  // tab's storage, and on the first render when it's come back to from
  // another page. `undefined` until then. The filters come back whoever is
  // open; the camera (below), the details folded or not and a lit connection
  // only to the view they belonged to — the same person open, or nobody.
  const memory = useCanvasMemory(treeId);
  const [recalled, setRecalled] = React.useState<CanvasMemory | null>();
  if (recalled === undefined && memory !== NOT_READ) {
    setRecalled(memory);
    if (memory) {
      const known = (id: string | null) => !!id && personById.has(id);
      setSideOnly(memory.sideOnly);
      setDescendantsOf(memory.descendantsOf.filter(known));
      setFilter(memory.filter);
      if (memory.person === selectedId) {
        setMinimized(memory.minimized);
        if (known(memory.connection.from) && known(memory.connection.to))
          setConnectionEnds(memory.connection);
      }
    }
  }
  // Whoever is open stays on the canvas: filters brought back that would
  // leave them off make way, as they do for a link to somebody (above).
  if (
    selectedId &&
    personById.has(selectedId) &&
    !shownIds.has(selectedId) &&
    (sideOnly || descendantsOf.length > 0)
  ) {
    setSideOnly(false);
    setDescendantsOf([]);
  }

  // Whoever is open goes in the address as they're opened and closed (Step
  // 77.3), so Back to the tree, or a reload, opens them again. Replaced, not
  // pushed: moving around the canvas isn't somewhere Back steps through.
  // Compared with the last one written, not skipped on mount, so an address
  // naming somebody still on their way (above) is left for them.
  const mirroredRef = React.useRef(selectedId);
  React.useEffect(() => {
    if (mirroredRef.current === selectedId) return;
    mirroredRef.current = selectedId;
    const url = new URL(window.location.href);
    if (url.searchParams.get("person") === selectedId) return;
    if (selectedId) url.searchParams.set("person", selectedId);
    else url.searchParams.delete("person");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [selectedId]);
  // Bumped to aim the camera again: at the viewer ("Go to me"), or at all of
  // what's drawn once the Root's side is switched (Step 48).
  const [aimTick, setAimTick] = React.useState(0);
  const [wholeTick, setWholeTick] = React.useState(0);
  const { getNode, getInternalNode, screenToFlowPosition, setCenter } =
    useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  // The canvas's own pixel size, for framing the pulled-out tree by hand.
  const paneWidth = useStore((state: ReactFlowState) => state.width);
  const paneHeight = useStore((state: ReactFlowState) => state.height);
  // On a phone the cards stay where the tree puts them (Step 49): a finger
  // on a card pans the canvas, which is what sliding one on a phone nearly
  // always means, so nothing is moved by accident. A tablet has room to aim
  // at a card, and drags (49.4).
  const phone = useIsPhone();

  // React Flow's own `colorMode="system"` reads the OS preference while it
  // renders, so the server said "light", the client said "dark", and hydration
  // complained — and the canvas ignored the member's own Light/Dark choice.
  // Drive it from the app's theme instead, holding the server's value until
  // mounted (the same guard `theme-toggle.tsx` uses).
  const { resolvedTheme } = useTheme();
  const [themeReady, setThemeReady] = React.useState(false);
  React.useEffect(() => {
    function markMounted() {
      setThemeReady(true);
    }
    markMounted();
  }, []);
  const colorMode = themeReady && resolvedTheme === "dark" ? "dark" : "light";

  // Re-seed the canvas whenever the graph itself changes — a new relative, or
  // an auto-arrange that cleared everybody's nudges. Cards and lines that
  // didn't change stay as the canvas holds them, and the rest carry their
  // measurements over, so nothing blinks out while it's measured again
  // (Step 87.1, audit C2).
  React.useEffect(() => {
    setNodes((held) => keepNodes(held, seeded));
    setEdges((held) => shareEqual(held, graph.edges));
  }, [graph, seeded, setNodes, setEdges]);

  // What the canvas dims and Upcoming leaves out follows the search a beat
  // behind the box being typed in (Step 87.2, audit C4): each key shows at
  // once, and the cards catch up when there's time, skipping the keys typed
  // meanwhile.
  const shownFilter = React.useDeferredValue(filter);
  const filterActive = isFilterActive(shownFilter);
  const matchingIds = React.useMemo(() => {
    if (!filterActive) return null;
    return new Set(
      shownPeople
        .filter((p) => matchesFilter(p, shownFilter))
        .map((p) => p.id),
    );
  }, [shownPeople, shownFilter, filterActive]);

  // Birthdays and anniversaries coming up (Step 57.1), among the people the
  // canvas draws and, while a search is on, the ones it leaves lit: a couple
  // stays when either of them is. A member's canvas only.
  const today = useToday();
  const occasions = React.useMemo(() => {
    if (readOnly || !today) return null;
    const all = upcomingOccasions(shownPeople, shownRelationships, today, {
      nameOf: (id) => nameById.get(id) ?? "",
    });
    return matchingIds
      ? all.filter((o) => o.people.some((id) => matchingIds.has(id)))
      : all;
  }, [
    readOnly,
    today,
    shownPeople,
    shownRelationships,
    nameById,
    matchingIds,
  ]);
  // Which card is open, Search & filters (top right) or Upcoming (top left):
  // one at a time, so on a phone they never pile up.
  const [openCard, setOpenCard] = React.useState<"search" | "upcoming" | null>(
    null,
  );

  // Clicking a person: their own tree — the line above and below them, plus
  // the partners along it, and their brothers and sisters beside them (Step
  // 19.3) — and the connections that run through it. Everyone else is blurred
  // back so the one lineage can be read on its own.
  // On My Family Tree a click lights how that person is connected to the
  // viewer instead (Step 97.1), as Show a connection would; a connection
  // picked in Search & filters still comes first. The same person clicked
  // again shows their own tree, and once more their connection again (Step
  // 97.2); the viewer's own leaf shows theirs at once, there being no
  // connection to show.
  const picked = !!connectionEnds.from && !!connectionEnds.to;
  const [ownTreeOf, setOwnTreeOf] = React.useState<string | null>(null);
  const ownTree =
    !!family &&
    !!selectedId &&
    (selectedId === ownTreeOf || selectedId === selfPersonId);
  const linkedToYou =
    !picked && !!family && !!selfPersonId && !!selectedId && !ownTree;
  // The chain of relationships between the two picked people, if there is one.
  const path = React.useMemo(
    () =>
      picked
        ? connectionPath(
            connectionEnds.from!,
            connectionEnds.to!,
            shownRelationships,
          )
        : linkedToYou
          ? connectionPath(selfPersonId!, selectedId!, shownRelationships)
          : null,
    [
      picked,
      linkedToYou,
      connectionEnds,
      selfPersonId,
      selectedId,
      shownRelationships,
    ],
  );

  const spotlight = React.useMemo(() => {
    // A connection between two people is pulled out exactly as one person's
    // tree is: the chain is the lit set, anchored on the first of the two.
    if (path) {
      const lit = new Set<string>([...path.people, ...path.coParents]);
      // Parent→child links the chain walks, whichever way it walked them.
      const links = new Set(
        path.steps.flatMap((s) =>
          s.kind === "up"
            ? [`${s.to}>${s.from}`]
            : s.kind === "down"
              ? [`${s.from}>${s.to}`]
              : [],
        ),
      );
      const edgeIds = new Set<string>();
      for (const e of graph.edges) {
        if (e.type === "descent") {
          const parents = (
            Array.isArray(e.data?.parents) ? e.data.parents : []
          ) as string[];
          if (parents.some((pid) => links.has(`${pid}>${e.target}`)))
            edgeIds.add(e.id);
        } else if (e.type === "spouse") {
          // A marriage the chain crosses, or the couple it turns round on.
          const pair = (
            Array.isArray(e.data?.pair) ? e.data.pair : []
          ) as string[];
          if (pair.length > 0 && pair.every((pid) => lit.has(pid)))
            edgeIds.add(e.id);
        }
      }
      return {
        anchorId: path.people[0],
        people: lit,
        // Companions are nobody's connection: none ride along.
        line: NOBODY,
        siblingSpouses: NOBODY,
        spouseOf: new Map<string, string>(),
        edgeIds,
        ancestors: 0,
        descendants: 0,
        brackets: path.steps
          .filter((s) => s.kind === "sibling")
          .map((s) => [s.from, s.to] as [string, string]),
      };
    }
    // On My Family Tree someone's own tree is pulled out only on a second
    // click, or for the viewer (above); one nothing joins to the viewer
    // lights nothing.
    if (!selectedId || (family && !ownTree)) return null;
    const roles = personSpotlight(selectedId, shownRelationships);
    const { ancestors, descendants, looseSiblings, line, siblingSpouses } =
      roles;
    const lit = spotlightPeople(roles);
    // Whose partner each pill is (Step 19.4), for its "Spouse of …".
    const firstNameById = new Map(
      people.map((p) => [p.id, p.preferred_name || p.first_name || ""]),
    );
    const spouseOf = new Map<string, string>();
    for (const r of shownRelationships) {
      if (r.type !== "spouse") continue;
      for (const [pill, sibling] of [
        [r.from_person, r.to_person],
        [r.to_person, r.from_person],
      ]) {
        if (siblingSpouses.has(pill) && roles.siblings.has(sibling))
          spouseOf.set(pill, firstNameById.get(sibling) || "a sibling");
      }
    }
    const edgeIds = new Set<string>();
    for (const e of graph.edges) {
      if (e.type === "descent") {
        const parents = (
          Array.isArray(e.data?.parents) ? e.data.parents : []
        ) as string[];
        // The child has to be on the line as well as a parent: a lit person's
        // partner brings their own children in otherwise.
        if (lit.has(e.target) && parents.some((pid) => lit.has(pid)))
          edgeIds.add(e.id);
      } else if (e.type === "spouse") {
        const pair = (
          Array.isArray(e.data?.pair) ? e.data.pair : []
        ) as string[];
        if (pair.length > 0 && pair.every((pid) => lit.has(pid)))
          edgeIds.add(e.id);
      } else if (line.has(e.source)) {
        // A companion's dotted lead, hanging off somebody on the line. A
        // sibling's companion stays behind with their children (Step 19.3).
        edgeIds.add(e.id);
      }
    }
    return {
      anchorId: selectedId,
      people: lit,
      line,
      siblingSpouses,
      spouseOf,
      edgeIds,
      ancestors,
      descendants,
      // A sibling with no parents on the tree gets a bracket to the person
      // instead of a bus (Step 19.3).
      brackets: [...looseSiblings].map(
        (sibling) => [selectedId, sibling] as [string, string],
      ),
    };
  }, [
    path,
    selectedId,
    shownRelationships,
    graph.edges,
    people,
    family,
    ownTree,
  ]);

  /**
   * Pull the line clear of the tree it sits in.
   *
   * The spotlit people are laid out again *on their own* — the same layout
   * engine, given only them — so the gaps their siblings, cousins and in-laws
   * were holding open close up and the lineage contracts into a small tree of
   * its own. It is anchored on the person who was clicked, who does not move,
   * so the rest visibly travels inward to them rather than the whole thing
   * jumping somewhere new. Companions come along, keeping their offset from
   * the person they belong to.
   *
   * Nothing here is written back to node state: these positions are painted on
   * over the real ones, so closing the spotlight puts everybody back and no
   * drag is ever recorded against a position the reader didn't choose.
   */
  const pulled = React.useMemo(() => {
    if (!spotlight) return null;
    const { anchorId } = spotlight;
    const lit = spotlight.people;
    const litPeople = shownPeople.filter((p) => lit.has(p.id));
    if (litPeople.length < 2) return null;

    const compact = layoutTree(litPeople, shownRelationships, {
      anchorIds: [anchorId],
      // Siblings' partners packed as pills (Step 19.4), and on My Family
      // Tree whoever married in (Step 94); a tree's overview layout never
      // passes this, so its positions are untouched.
      compactIds:
        pillIds.size > 0
          ? new Set([...spotlight.siblingSpouses, ...pillIds])
          : spotlight.siblingSpouses,
      // Each family hangs straight under its parents' trunk, so the line
      // drops onto the middle of the children's bar with no step.
      centreFamilies: true,
    });
    const anchor = compact.autoPositions.get(anchorId);
    const home = graph.layout.positions.get(anchorId);
    if (!anchor || !home) return null;
    const dx = home.x - anchor.x;
    const dy = home.y - anchor.y;

    const positions = new Map<string, XY>();
    for (const [id, spot] of compact.autoPositions)
      positions.set(id, { x: spot.x + dx, y: spot.y + dy });

    for (const pet of pets) {
      if (!pet.companions.some((id) => spotlight.line.has(id))) continue;
      const primary = pet.primary_person_id ?? pet.companions[0];
      if (!primary) continue;
      const moved = positions.get(primary);
      const wasPerson = graph.layout.positions.get(primary);
      const wasPet = graph.petPositions.get(pet.id);
      if (!moved || !wasPerson || !wasPet) continue;
      positions.set(pet.id, {
        x: wasPet.x + (moved.x - wasPerson.x),
        y: wasPet.y + (moved.y - wasPerson.y),
      });
    }
    return positions;
  }, [spotlight, shownPeople, pets, shownRelationships, graph, pillIds]);

  // Clicking a connection: work out what it joins, name it, and collect the
  // nodes and edges the spotlight should keep lit.
  const connection = React.useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = graph.edges.find((e) => e.id === selectedEdgeId.id);
    if (!edge) return null;

    if (edge.type === "descent") {
      // A descent line is one link in a bloodline, so light the whole run of
      // them rather than the single link that was clicked. Which run depends on
      // which end of the line the click was nearer — see `onEdgeClick`.
      const { direction } = selectedEdgeId;
      const parents = (
        Array.isArray(edge.data?.parents) ? edge.data.parents : []
      ) as string[];
      // Looking up, the run belongs to the child at the bottom of the line;
      // looking down, it belongs to the parents at the top.
      const roots = direction === "up" ? [edge.target] : parents;
      const rootNames = roots
        .map((pid) => nameById.get(pid))
        .filter((n): n is string => !!n);
      if (rootNames.length === 0) return null;

      const line = new Set<string>();
      for (const root of roots)
        for (const id of bloodline(root, shownRelationships, direction))
          line.add(id);
      if (line.size === 0) return null;

      const edgeIds = new Set<string>();
      const forks: string[][] = [];
      for (const e of graph.edges) {
        if (e.type !== "descent") continue;
        // The descent lines that make up the run: going up, every line arriving
        // at the person or at one of their ancestors; going down, every line
        // arriving at one of their descendants. Either way a line arriving at
        // somebody off the bloodline — a sibling, an in-law — stays dim.
        const onLine =
          line.has(e.target) || (direction === "up" && e.target === roots[0]);
        if (!onLine) continue;
        edgeIds.add(e.id);
        forks.push(
          (Array.isArray(e.data?.parents) ? e.data.parents : []) as string[],
        );
      }
      for (const e of graph.edges) {
        if (e.type !== "spouse") continue;
        const pair = (
          Array.isArray(e.data?.pair) ? e.data.pair : []
        ) as string[];
        // A spouse line is the fork its couple's children hang off, so light it
        // whenever a lit descent line actually leaves it. Matching on the fork
        // rather than on the bloodline keeps a married-in partner's half of the
        // fork lit too — going down, the trunk to a grandchild leaves the line
        // between a descendant and the person they had that child with.
        if (
          pair.length > 0 &&
          forks.some(
            (parents) =>
              parents.length === pair.length &&
              parents.every((pid) => pair.includes(pid)),
          )
        )
          edgeIds.add(e.id);
      }

      const kind = direction === "up" ? "ancestor" : "descendant";
      return {
        endpoints: new Set<string>([...roots, ...line]),
        // Everyone the lit lines touch stays bright and the rest of the tree
        // dims — including each fork's other parent, so a married-in partner
        // doesn't fade out from under the line their children hang off.
        cards: new Set<string>([...roots, ...line, ...forks.flat()]),
        edgeIds,
        label: direction === "up" ? "Ancestors" : "Descendants",
        separator: direction === "up" ? "↑" : "↓",
        from: rootNames.join(" & "),
        to: countOf(line.size, kind),
      };
    }

    if (edge.type === "spouse") {
      const pair = (
        Array.isArray(edge.data?.pair) ? edge.data.pair : []
      ) as string[];
      const [aName, bName] = pair.map((pid) => nameById.get(pid));
      if (!aName || !bName) return null;
      const rel = shownRelationships.find(
        (r) =>
          r.type === "spouse" &&
          ((r.from_person === pair[0] && r.to_person === pair[1]) ||
            (r.from_person === pair[1] && r.to_person === pair[0])),
      );
      return {
        endpoints: new Set<string>(pair),
        cards: new Set<string>(pair),
        edgeIds: new Set<string>([edge.id]),
        label: rel?.is_divorced ? "Former spouses" : "Spouses",
        separator: "—",
        from: aName,
        to: bName,
      };
    }

    return null;
  }, [selectedEdgeId, graph.edges, nameById, shownRelationships]);

  // Each card's tree mark on My Family Tree (Step 92.2): one object per
  // tree, so a card's data stays the same while its tree does.
  const markById = React.useMemo(() => {
    const byTree = new Map<string, CardMark>(
      (family?.trees ?? []).map((t) => [t.id, { ...t.mark, name: t.name }]),
    );
    return new Map(
      people.flatMap((p) => {
        const mark = p.tree_id ? byTree.get(p.tree_id) : undefined;
        return mark ? [[p.id, mark] as const] : [];
      }),
    );
  }, [family, people]);
  // On My Family Tree, the cards that may be someone else's too (Step
  // 92.4), less the pairs this browser was told are two people; each card
  // says whom, and its sheet asks.
  const [notSame, setNotSame] = useNotSame(isFamily);
  const sameById = React.useMemo(
    () => (family ? samePeopleById(family.samePeople, notSame) : NO_SAME),
    [family, notSame],
  );
  const sameNameOf = React.useCallback(
    (id: string) => (id === selfPersonId ? "you" : (nameById.get(id) ?? "")),
    [selfPersonId, nameById],
  );
  const sameLabelById = React.useMemo(
    () =>
      new Map(
        [...sameById].map(([id, others]) => [
          id,
          samePersonLabel(others.map(sameNameOf)),
        ]),
      ),
    [sameById, sameNameOf],
  );
  // Whom each married-in pill married into (Step 94), for the pill after
  // "Married in" and for the sheet: the viewer's own spouse is "Your
  // spouse".
  const marriedToById = React.useMemo(() => {
    if (marriedIn.size === 0) return null;
    const firstNameOf = (id: string) => {
      const p = personById.get(id);
      return p?.preferred_name || p?.first_name || "a relative";
    };
    return new Map(
      [...marriedIn.values()].map((m) => [
        m.id,
        marriedInLabel(m.kind, m.to === selfPersonId ? null : firstNameOf(m.to)),
      ]),
    );
  }, [marriedIn, personById, selfPersonId]);
  // Everything the canvas says about a card beyond where it sits — the ring on
  // the open entry, the fade on a card the search filtered out, the ring on a
  // clicked connection's endpoints, and the spotlight's lit line against its
  // blurred surroundings — is derived here rather than written back into node
  // state. Held as state it went stale every time the graph was re-seeded: the
  // fresh nodes came back with the flags cleared and the open entry quietly
  // lost its ring.
  //
  // It is built off `graph.nodes` — the layout's own copies, which only change
  // when the tree does — rather than off the live `nodes` state, so a drag
  // hands every card back the same `data` object it already had and only the
  // card being dragged re-renders.
  const freshDataById = React.useMemo(() => {
    const petById = new Map(pets.map((pet) => [pet.id, pet]));
    const endpoints = connection?.endpoints ?? null;
    const lineCards = connection?.cards ?? null;
    const lit = spotlight?.people ?? null;
    // The two people a lit connection runs between stand out from the chain.
    const ends = path
      ? new Set([path.people[0], path.people[path.people.length - 1]])
      : NOBODY;
    const map = new Map<string, Record<string, unknown>>();
    for (const n of graph.nodes) {
      const isPet = n.type === "pet";
      const pet = isPet ? petById.get(n.id) : undefined;
      const selected = isPet
        ? n.id === selectedPetId
        : n.id === selectedId || ends.has(n.id);
      const filteredOut =
        matchingIds === null
          ? false
          : isPet
            ? pet
              ? !petMatchesFilter(pet, shownFilter, matchingIds)
              : false
            : !matchingIds.has(n.id);
      // A clicked line shows only the family it runs through; companions go
      // with the rest, their leads already faded with the other lines.
      const offLine = !!lineCards && (isPet || !lineCards.has(n.id));
      const dimmed = filteredOut || offLine;
      const highlighted = !isPet && (endpoints?.has(n.id) ?? false);
      // A companion follows its people onto the lit line, and off it.
      const inLine = !lit
        ? false
        : isPet
          ? !!pet?.companions.some((id) => spotlight?.line.has(id))
          : lit.has(n.id);
      // A pill: whoever married in, on My Family Tree (Step 94), or a
      // sibling's partner in a spotlight (Step 19.4).
      const pillLabel = isPet
        ? undefined
        : marriedToById?.has(n.id)
          ? `Married in · ${marriedToById.get(n.id)}`
          : (spotlight?.siblingSpouses.has(n.id)
            ? `Spouse of ${spotlight.spouseOf.get(n.id) || "a sibling"}`
            : undefined);
      const mark = isPet ? undefined : markById.get(n.id);
      const same = isPet ? undefined : sameLabelById.get(n.id);
      // The lit line stands in front, never faded or blurred; on My Family
      // Tree everyone else is a leaf too, faded and blurred as a card is.
      const litLeaf = !!lit && inLine;
      map.set(n.id, {
        ...n.data,
        ...(mark ? { mark } : {}),
        ...(same ? { same } : {}),
        selected,
        dimmed: dimmed && !litLeaf,
        highlighted,
        lineage: litLeaf || (allLeaves && !isPet),
        blurred:
          !litLeaf &&
          ((!!lit && !inLine) ||
            (!isPet &&
              !!(n.data as { person?: { blurred?: boolean } }).person
                ?.blurred)),
        ...(pillLabel ? { compressed: true, pillLabel } : {}),
        ...(spouseIds.has(n.id) ? { yourSpouse: true } : {}),
        ...(memberIds && !isPet ? { member: memberIds.has(n.id) } : {}),
      });
    }
    return map;
  }, [
    graph.nodes,
    pets,
    shownFilter,
    matchingIds,
    connection,
    spotlight,
    path,
    selectedId,
    selectedPetId,
    markById,
    sameLabelById,
    marriedToById,
    spouseIds,
    memberIds,
    allLeaves,
  ]);
  // A card whose flags came out the same is handed the very same `data`, so
  // it doesn't draw again when the rest of the tree changes (Step 87.1).
  const dataById = useKept(freshDataById, keepEntries);

  // A card that turns into a leaf is a different piece of DOM with its handles
  // in new elements, and the canvas has no way of knowing that on its own: it
  // keeps the bounds it measured for the rectangle, stops considering the graph
  // initialised, and every edge stays pinned to where a handle used to be.
  // Telling it which cards changed shape puts all of that right — and only
  // those: measuring a card forces a layout, and on My Family Tree, where
  // everyone is a leaf already, a click changes nobody's shape.
  const shapes = React.useRef<Map<string, string>>(new Map());
  React.useEffect(() => {
    const changed: string[] = [];
    const next = new Map<string, string>();
    for (const [id, data] of dataById) {
      const shape = data.compressed ? "pill" : data.lineage ? "leaf" : "card";
      next.set(id, shape);
      const was = shapes.current.get(id);
      if (was !== undefined && was !== shape) changed.push(id);
    }
    shapes.current = next;
    if (changed.length > 0) updateNodeInternals(changed);
  }, [dataById, updateNodeInternals]);

  const displayNodes = React.useMemo(
    () =>
      nodes.map((n) => {
        const data = dataById.get(n.id);
        const position = pulled?.get(n.id);
        if (!position && (!data || data === n.data)) return n;
        return {
          ...n,
          ...(data ? { data } : {}),
          ...(position ? { position } : {}),
          // The pulled-out line rides over what is left behind it.
          ...(pulled ? { zIndex: position ? 20 : 0 } : {}),
        };
      }),
    [nodes, dataById, pulled],
  );

  // How far a leaf's blade reaches above its card, so a line into it can stop
  // short of that leaf rather than the tallest one.
  const leafBladeTop = React.useCallback(
    (id: string) => {
      const person = personById.get(id);
      return person ? bladeTop(nativeLeaf(person).shape) : 0;
    },
    [personById],
  );

  // Fade every connection except the spotlighted one — for a descent line the
  // whole bloodline above it, for a person the whole line their tree hangs on
  // — and draw what's left in trunk brown: the lit lines are the branches the
  // leaves grow off, and they thicken as they carry more.
  const displayEdges = React.useMemo(() => {
    // My Family Tree at rest: every line is a lit branch.
    const activeIds =
      connection?.edgeIds ?? spotlight?.edgeIds ?? (allLeaves ? ALL : null);
    if (!activeIds) return edges;
    // While a tree is pulled out its descent lines come down over each leaf
    // and stop just above its blade, whose top depends on the species. Every
    // line into a leaf is routed that way, lit or not: a faded line still
    // crosses the blade it lands on. On My Family Tree that's every line
    // into anyone but a pill.
    const front = pulled ? (spotlight?.people ?? null) : null;
    const isLeaf = (id: string) =>
      (allLeaves && !pillIds.has(id)) || !!front?.has(id);
    const shown: Edge[] = edges.map((e) => {
      const active = activeIds.has(e.id);
      const toLeaf = e.type === "descent" && isLeaf(e.target);
      // A half-sibling's other parent stays behind, blurred, in the tree
      // (Step 19.3): route their line from the parent who came along only,
      // or the trunk would start halfway to someone left out of the picture.
      const parents = (
        Array.isArray(e.data?.parents) ? e.data.parents : []
      ) as string[];
      const litParents =
        front && front.has(e.target) && active
          ? parents.filter((pid) => front.has(pid))
          : parents;
      // A bar spans only the children drawn the same way: the leaves pulled
      // out share one, and whoever stayed behind in the tree keeps another.
      const siblings = (
        Array.isArray(e.data?.siblings) ? e.data.siblings : []
      ) as string[];
      const barSiblings =
        front && e.type === "descent"
          ? siblings.filter((cid) => front.has(cid) === front.has(e.target))
          : siblings;
      // The pulled layout can seat a partner on the other side (a pill goes
      // on the far side of its sibling, Step 19.4), so a spouse line runs
      // from whoever is on the left now, or it would cross both cards.
      const [from, to] = [pulled?.get(e.source), pulled?.get(e.target)];
      const flip = e.type === "spouse" && !!from && !!to && from.x > to.x;
      return {
        ...e,
        ...(flip
          ? {
              source: e.target,
              target: e.source,
              data: { ...e.data, pair: [e.target, e.source] },
            }
          : {}),
        ...(toLeaf
          ? {
              targetHandle: "l",
              data: {
                ...e.data,
                toLeaf: true,
                bladeTop: leafBladeTop(e.target),
                parents: litParents,
                siblings: barSiblings,
              },
            }
          : barSiblings !== siblings
            ? { data: { ...e.data, siblings: barSiblings } }
            : {}),
        style: {
          ...e.style,
          ...(active
            ? {
                stroke: SPOTLIGHT_BROWN,
                strokeWidth: 3,
                opacity: 1,
                strokeLinecap: "round" as const,
              }
            : { opacity: 0.1 }),
        },
        zIndex: active ? 10 : undefined,
      };
    });
    // Siblings with no parents on the tree get a bracket instead of a bus
    // (Step 19.3), dashed because it stands for a stated relationship rather
    // than a line of descent anyone can trace.
    if (pulled && !connection) {
      for (const [from, sibling] of spotlight?.brackets ?? []) {
        shown.push({
          id: `b:${from}~${sibling}`,
          source: from,
          target: sibling,
          // Handles only anchor the edge; the path comes from the cards.
          sourceHandle: "r",
          targetHandle: "l",
          type: "siblingBracket",
          data: { pair: [from, sibling] },
          selectable: false,
          focusable: false,
          style: {
            stroke: SPOTLIGHT_BROWN,
            strokeWidth: 3,
            strokeDasharray: "6 6",
            strokeLinecap: "round",
          },
          zIndex: 10,
        });
      }
    }
    return shown;
  }, [
    edges,
    connection,
    spotlight,
    pulled,
    leafBladeTop,
    allLeaves,
    pillIds,
  ]);

  /**
   * A descent line is below its parents and above its child at the same time,
   * so *where* it was clicked decides whose bloodline is meant: the trunk half,
   * up by the parents, means "below them" and lights their descendants; the
   * stub half, down by the child, means "above them" and lights their
   * ancestors. The horizontal bus between the two is the dividing line.
   */
  const onEdgeClick = React.useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      setSelectedId(null);
      setConnectionEnds(NO_CONNECTION);
      let direction: BloodlineDirection = "up";
      if (edge.type === "descent") {
        const parents = (
          Array.isArray(edge.data?.parents) ? edge.data.parents : []
        ) as string[];
        const child = getNode(edge.target);
        const rects = parents
          .map((parentId) => {
            const node = getNode(parentId);
            if (!node) return null;
            return {
              x: node.position.x,
              y: node.position.y,
              w: node.measured?.width ?? NODE_W,
              h: node.measured?.height ?? NODE_H,
            };
          })
          .filter((rect): rect is CardRect => rect !== null);
        // Fall back to the layout's own bus for a card React Flow has not
        // measured yet, so an early click still picks a sensible direction.
        // The bus sits above the highest sibling, as the edge draws it.
        const siblings = (
          Array.isArray(edge.data?.siblings) ? edge.data.siblings : []
        ) as string[];
        const tops = siblings
          .map((childId) => getNode(childId)?.position.y)
          .filter((y): y is number => y !== undefined);
        const childTop =
          tops.length > 1 ? Math.min(...tops) : (child?.position.y ?? 0);
        const busY =
          descentGeometry(rects, childTop)?.busY ??
          (typeof edge.data?.busY === "number" ? edge.data.busY : 0);
        direction =
          screenToFlowPosition({ x: event.clientX, y: event.clientY }).y > busY
            ? "up"
            : "down";
      }
      setSelectedEdgeId((cur) =>
        cur?.id === edge.id && cur.direction === direction
          ? null
          : { id: edge.id, direction },
      );
    },
    [getNode, screenToFlowPosition],
  );

  const selectPerson = React.useCallback(
    (personId: string) => {
      setSelectedPetId(null);
      setConnectionEnds(NO_CONNECTION);
      setSelectedId(personId);
      // A companion's person the filters leave off: the whole tree comes back.
      if (!shownIds.has(personId)) {
        setSideOnly(false);
        setDescendantsOf([]);
      }
    },
    [shownIds],
  );

  // Opening someone from a search result: their details go on to ask who to
  // connect them to.
  const onPick = React.useCallback(
    (personId: string) => {
      selectPerson(personId);
      setSearchedId(personId);
    },
    [selectPerson],
  );

  // Both ends picked and a chain between them: the connection takes over the
  // canvas from whoever was open. With no chain the canvas stays as it was and
  // the filters card says so.
  // Answers whether a connection was lit.
  const onConnectionChange = React.useCallback(
    (next: ConnectionEnds): boolean => {
      setConnectionEnds(next);
      const lit =
        !!next.from &&
        !!next.to &&
        !!connectionPath(next.from, next.to, shownRelationships);
      if (lit) {
        setSelectedId(null);
        setSelectedPetId(null);
        setSelectedEdgeId(null);
      }
      return lit;
    },
    [shownRelationships],
  );

  /**
   * Aim the camera, in both directions.
   *
   * Opening a person's tree frames the *compact* positions their cards are
   * travelling to; closing it frames every card again, so the reader is handed
   * back the whole family rather than left on the patch of canvas the lineage
   * happened to occupy. Both do the arithmetic here rather than calling
   * `fitView`, which reads the canvas's own store — during a pull-out that
   * store is a frame behind, and it holds nothing about the details sheet
   * covering the right-hand side.
   *
   * Gated on the canvas's own first fit rather than on whether every card has
   * been measured: cards change shape here, and a measurement that is briefly
   * out of date should not cost the reader the camera move.
   */
  // The canvas can only be aimed once its pan-zoom exists; before that a
  // camera move is silently dropped. `onInit` fires earlier than that, so this
  // watches the store for the instance itself.
  const canvasReady = useStore((state: ReactFlowState) => !!state.panZoom);
  const frame = React.useCallback(
    (spots: XY[], panelWidth: number, maxZoom: number, instant = false) => {
      if (spots.length === 0 || !paneWidth || !paneHeight) return;
      const minX = Math.min(...spots.map((s) => s.x));
      const maxX = Math.max(...spots.map((s) => s.x)) + NODE_W;
      const minY = Math.min(...spots.map((s) => s.y));
      const maxY = Math.max(...spots.map((s) => s.y)) + NODE_H;
      const usableW = Math.max(240, paneWidth - panelWidth - 160);
      const usableH = Math.max(240, paneHeight - 220);
      const zoom = Math.min(
        maxZoom,
        usableW / (maxX - minX),
        usableH / (maxY - minY),
      );
      void setCenter(
        (minX + maxX) / 2 + panelWidth / 2 / zoom,
        (minY + maxY) / 2,
        instant ? { zoom, duration: 0 } : { zoom, ...CAMERA },
      );
    },
    [paneWidth, paneHeight, setCenter],
  );

  /** The person whose tree the camera is currently framing. */
  const framedRef = React.useRef<string | null>(null);

  // The opening view: the whole tree, once the canvas can be aimed at all,
  // and what this tab kept of the canvas has been brought back.
  const openedRef = React.useRef(false);
  React.useEffect(() => {
    if (!canvasReady || !paneWidth || recalled === undefined) return;
    if (openedRef.current) return;
    openedRef.current = true;
    // Back where the camera was left (Step 77.3), when who's open is who was
    // then — or nobody, as then: the tree is drawn as it was, so the view
    // still fits. What it frames stays framed (below).
    if (recalled?.view && recalled.person === selectedId) {
      const { x, y, zoom } = recalled.view;
      void setCenter(x, y, { zoom, duration: 0 });
      framedRef.current = KEPT_VIEW;
      return;
    }
    // Unless the canvas was opened on somebody (`/tree?person=…`), in which
    // case the effect below is framing their tree instead.
    if (selectedId) return;
    // Instant, not animated: the opening view has nothing to animate from, and
    // an animated camera move this early is dropped before it starts.
    frame([...graph.layout.positions.values()], 0, 1, true);
  }, [
    canvasReady,
    paneWidth,
    recalled,
    selectedId,
    graph.layout.positions,
    frame,
    setCenter,
  ]);

  // Whether a person's details sheet covers the right of the canvas: not for
  // a blurred card, which has none, nor once it's minimized (Step 49), when
  // the tree gets the whole canvas.
  const sheetOut =
    !!selectedId && !minimized && !personById.get(selectedId)?.blurred;

  React.useEffect(() => {
    if (!canvasReady || !paneWidth || !paneHeight) return;
    if (recalled === undefined) return;
    // One person's tree, framed again when their details are minimized or
    // brought back (Step 49), or the connection between two.
    const framedKey = path
      ? `${path.people[0]}~${path.people[path.people.length - 1]}${
          linkedToYou && sheetOut ? "+sheet" : ""
        }`
      : selectedId
        ? `${selectedId}${sheetOut ? "+sheet" : ""}`
        : null;
    // The camera put back where it was left (above) already frames it.
    if (framedRef.current === KEPT_VIEW) {
      framedRef.current = framedKey && spotlight ? framedKey : null;
      return;
    }
    if (!framedKey || !spotlight) {
      if (!framedRef.current) return;
      framedRef.current = null;
      // Back out to the whole tree, never magnified past life size.
      frame([...graph.layout.positions.values()], 0, 1);
      return;
    }
    if (framedRef.current === framedKey) return;
    framedRef.current = framedKey;

    // The details sheet covers the right of a wide canvas, so frame the tree
    // in what is left of it. On a narrow screen the sheet covers everything
    // and there is nothing to aim around; on a middling one it is never given
    // more than a third of the canvas, or the strip left over is too thin to
    // put a family in.
    const panel =
      sheetOut && paneWidth >= 640 ? Math.min(448, paneWidth / 3) : 0;
    const spots = pulled
      ? [...spotlight.people].flatMap((id) => {
          const spot = pulled.get(id);
          return spot ? [spot] : [];
        })
      : [];
    // Aimed as the cards set off, and moving as they do (`CAMERA`). It once
    // waited 120ms for the re-measure of cards turned into leaves, and so
    // arrived last; with only those cards re-measured (above), a camera
    // move in flight runs to the end without the wait.
    const alone = graph.layout.positions.get(spotlight.anchorId);
    const target = spots.length > 0 ? spots : alone ? [alone] : [];
    if (target.length === 0) return;
    frame(target, panel, 1.15);
  }, [
    canvasReady,
    recalled,
    path,
    linkedToYou,
    selectedId,
    sheetOut,
    spotlight,
    pulled,
    paneWidth,
    paneHeight,
    graph.layout.positions,
    frame,
    aimTick,
  ]);

  // Once the Root's side is switched on or off, all of what's drawn now:
  // once per switch, not every time the tree changes under the camera.
  const framedWholeRef = React.useRef(0);
  React.useEffect(() => {
    if (!canvasReady || wholeTick === framedWholeRef.current) return;
    const spots = [...graph.layout.positions.values()];
    const timer = setTimeout(() => {
      framedWholeRef.current = wholeTick;
      frame(spots, 0, 1);
    }, 120);
    return () => clearTimeout(timer);
  }, [canvasReady, wholeTick, graph.layout.positions, frame]);

  // "Go to me" (Step 48): the viewer's own tree pulled out and their details
  // open, as though they'd clicked their card, and aimed at again even when
  // it's open already, since they may have panned away.
  const selfOnCanvas =
    !!selfPersonId && graph.layout.positions.has(selfPersonId);
  const goToMe = React.useCallback(() => {
    if (!selfPersonId) return;
    setSelectedEdgeId(null);
    setSearchedId(null);
    selectPerson(selfPersonId);
    framedRef.current = null;
    setAimTick((n) => n + 1);
  }, [selfPersonId, selectPerson]);

  // Who else has the tree open, and their pointers (Step 57.3): members on
  // their own tree only, never a share link or a visitor.
  const selfEntry = selfPersonId ? personById.get(selfPersonId) : undefined;
  const roomMe = React.useMemo(
    () =>
      !editable || !currentUserId
        ? null
        : {
            person: selfPersonId,
            name: selfEntry
              ? (selfEntry.preferred_name || selfEntry.first_name || "").trim() ||
                personDisplayName(selfEntry)
              : "",
          },
    [editable, currentUserId, selfPersonId, selfEntry],
  );
  const room = useTreeRoom(treeId, currentUserId, roomMe);
  const roomColours = React.useMemo(
    () =>
      presenceColours([currentUserId, ...room.peers.map((p) => p.userId)]),
    [currentUserId, room.peers],
  );
  const flowStore = useStoreApi();
  const { sendCursor } = room;
  const onCanvasPointerMove = React.useCallback(
    (event: React.PointerEvent) => {
      if (!roomMe || event.pointerType === "touch") return;
      // Over a card of controls rather than the tree: off the canvas.
      if ((event.target as Element).closest(".react-flow__panel")) {
        sendCursor(null);
        return;
      }
      const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const cards = [...flowStore.getState().nodeLookup.values()].flatMap(
        (n) =>
          n.hidden
            ? []
            : [
                {
                  id: n.id,
                  ...n.internals.positionAbsolute,
                  width: n.measured.width ?? NODE_W,
                  height: n.measured.height ?? NODE_H,
                },
              ],
      );
      sendCursor(anchorPoint(at, cards));
    },
    [roomMe, screenToFlowPosition, flowStore, sendCursor],
  );
  const goToPeer = React.useCallback(
    (peer: Peer) => {
      const zoom = flowStore.getState().transform[2];
      const cardAt = (id: string) => {
        const node = getInternalNode(id);
        return node && !node.hidden ? node.internals.positionAbsolute : null;
      };
      const point = room.cursors.get().get(peer.userId);
      const pointer = point ? placePoint(point, cardAt) : null;
      if (pointer) {
        void setCenter(pointer.x, pointer.y, { zoom, duration: 500 });
        return;
      }
      const card = peer.person ? cardAt(peer.person) : null;
      if (card)
        void setCenter(card.x + NODE_W / 2, card.y + NODE_H / 2, {
          zoom,
          duration: 500,
        });
    },
    [flowStore, getInternalNode, room.cursors, setCenter],
  );

  // Kept for this tab as the canvas goes (Step 77.3): who's open, the
  // filters and the camera, for when it opens again. Only once what was kept
  // before has been brought back, or it would be written over with how a
  // canvas starts.
  const keptRef = React.useRef<Omit<CanvasMemory, "view"> | null>(null);
  React.useEffect(() => {
    keptRef.current =
      recalled === undefined
        ? null
        : {
            person: selectedId,
            sideOnly,
            descendantsOf,
            filter,
            connection: connectionEnds,
            minimized,
          };
  }, [
    recalled,
    selectedId,
    sideOnly,
    descendantsOf,
    filter,
    connectionEnds,
    minimized,
  ]);
  React.useEffect(() => {
    // Written as the canvas goes — to another page, or the tab away — with
    // the camera as it is then; before the camera was ever aimed, as it was
    // kept.
    const keep = () => {
      const kept = keptRef.current;
      if (!kept) return;
      let view =
        recalled && recalled.person === kept.person ? recalled.view : null;
      if (openedRef.current) {
        const { transform, width, height } = flowStore.getState();
        const [tx, ty, zoom] = transform;
        if (width && height && zoom)
          view = {
            x: (width / 2 - tx) / zoom,
            y: (height / 2 - ty) / zoom,
            zoom,
          };
      }
      rememberCanvas(treeId, { ...kept, view });
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") keep();
    };
    window.addEventListener("pagehide", keep);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", keep);
      document.removeEventListener("visibilitychange", onHidden);
      keep();
    };
  }, [treeId, recalled, flowStore]);

  // Switching a filter starts afresh on what's drawn: nobody open, nothing
  // lit, the camera on all of it.
  const startAfresh = React.useCallback(() => {
    setSelectedId(null);
    setSelectedPetId(null);
    setSelectedEdgeId(null);
    setConnectionEnds(NO_CONNECTION);
    setSearchedId(null);
    setWholeTick((n) => n + 1);
  }, []);
  const onSideOnlyChange = React.useCallback(
    (on: boolean) => {
      setSideOnly(on);
      // Anyone picked for "Only descendants of" off the side is let go, so a
      // filter that's on always shows.
      if (on && rootSide)
        setDescendantsOf((cur) => cur.filter((id) => rootSide.ids.has(id)));
      startAfresh();
    },
    [rootSide, startAfresh],
  );
  const onDescendantsOfChange = React.useCallback(
    (ids: string[]) => {
      setDescendantsOf(ids);
      startAfresh();
    },
    [startAfresh],
  );

  const onNodeClick = React.useCallback<NodeMouseHandler>(
    (_, node) => {
      setSelectedEdgeId(null);
      setConnectionEnds(NO_CONNECTION);
      setSearchedId(null);
      if (node.type === "pet") {
        setSelectedId(null);
        setSelectedPetId(node.id);
        return;
      }
      if (node.type !== "person") return;
      setSelectedPetId(null);
      setSelectedId(node.id);
      // On My Family Tree the one open, clicked again, swaps their
      // connection to the viewer for their own tree and back (Step 97.2);
      // anyone else starts on their connection.
      setOwnTreeOf((was) =>
        family && node.id === selectedId && was !== node.id ? node.id : null,
      );
    },
    [family, selectedId],
  );

  // A drag is stored as a nudge from where the layout put the card, so the
  // card keeps its offset as the tree grows instead of freezing in place.
  // The canvas lays the card out there itself (Step 87.3), and the save
  // doesn't draw the page again. A refused move says why and puts the card
  // back where the tree last had it — its seeded position, saved nudges
  // included — rather than leaving it where it was dropped as though the
  // move had stuck. So does a move that never reached the server. Nothing
  // waits on the answer: the card is already where it was dropped.
  const onNodeDragStop = React.useCallback<OnNodeDrag>(
    (_, node) => {
      const drop = (
        was: Placement,
        at: Placement,
        save: () => Promise<{ error?: string }>,
      ) => {
        const token = dropCard(treeId, node.id, was, at);
        const putBack = (message: string) => {
          toastError(message);
          dropUndone(treeId, node.id, token);
        };
        void save().then(
          (res) => {
            if (res.error) putBack(res.error);
            else dropSaved(treeId, node.id, token);
          },
          (thrown: unknown) => {
            // Signed out meanwhile: the action redirected, and the router
            // is already on its way there.
            if (isRedirect(thrown)) return;
            console.error(thrown);
            putBack(UNREACHABLE);
          },
        );
      };
      if (node.type === "pet") {
        const spot = graph.petPositions.get(node.id);
        const pet = allPets.find((p) => p.id === node.id);
        if (!spot || !pet) return;
        const dx = Math.round(node.position.x - spot.x);
        const dy = Math.round(node.position.y - spot.y);
        drop(
          { pos_dx: pet.pos_dx, pos_dy: pet.pos_dy },
          { pos_dx: dx, pos_dy: dy },
          () => setPetPosition(node.id, dx, dy),
        );
        return;
      }
      if (node.type !== "person") return;
      const auto = graph.layout.autoPositions.get(node.id);
      const person = personById.get(node.id);
      if (!auto || !person) return;
      const dx = Math.round(node.position.x - auto.x);
      const dy = Math.round(node.position.y - auto.y);
      drop(
        {
          pos_dx: person.pos_dx,
          pos_dy: person.pos_dy,
          pos_x: person.pos_x,
          pos_y: person.pos_y,
        },
        { pos_dx: dx, pos_dy: dy, pos_x: null, pos_y: null },
        () => setPersonPosition(treeId, node.id, dx, dy),
      );
    },
    [graph, allPets, personById, treeId],
  );

  const selectedPerson = people.find((p) => p.id === selectedId) ?? null;
  // My Family Tree is arranged around the viewer, so its rows are named
  // from them (Step 92.2): "Your generation", "Parents' generation".
  const bands = React.useMemo(
    () =>
      isFamily
        ? graph.layout.bands.map((band) => ({
            ...band,
            label: generationLabelFromYou(band.generation),
          }))
        : graph.layout.bands,
    [isFamily, graph.layout.bands],
  );
  // Minimized to the card that stands in for the "…'s tree" pill. Never
  // for a blurred card: it has no details to bring back.
  const folded = minimized && !!selectedPerson && !selectedPerson.blurred;

  // What the lit connection is called, for the pill under it.
  const pathSummary = React.useMemo(() => {
    if (!path) return null;
    const [first, last] = [path.people[0], path.people[path.people.length - 1]];
    const [step] = path.steps;
    // Only the canvas's own edges know a marriage has ended.
    const divorced =
      path.steps.length === 1 &&
      step.kind === "spouse" &&
      shownRelationships.some(
        (r) =>
          r.type === "spouse" &&
          r.is_divorced &&
          ((r.from_person === first && r.to_person === last) ||
            (r.from_person === last && r.to_person === first)),
      );
    return {
      // From the viewer's own leaf on My Family Tree, it's them.
      from: linkedToYou ? "You" : (nameById.get(first) ?? ""),
      to: nameById.get(last) ?? "",
      label: divorced
        ? "Former spouses"
        : connectionLabel(
            path,
            shownRelationships,
            (id) => personById.get(id)?.sex,
          ),
    };
  }, [path, shownRelationships, nameById, personById, linkedToYou]);

  // Offered in a searched-for person's details: light the line from them to
  // somebody else. Refused here, with the reason, when nothing joins the two —
  // the details sheet has nowhere to show an empty connection.
  const connectFromSelected = React.useCallback(
    (toId: string) => {
      if (!selectedId) return;
      if (!connectionPath(selectedId, toId, shownRelationships)) {
        toast.info(
          `Nothing on the tree joins ${nameById.get(selectedId) ?? "them"} and ${nameById.get(toId) ?? "them"} yet.`,
        );
        return;
      }
      onConnectionChange({ from: selectedId, to: toId });
    },
    [selectedId, shownRelationships, nameById, onConnectionChange],
  );
  // The selected person, by the name the Add button and the connection prompt
  // call them. Kept while they stay the same, like everything else the
  // details sheet is handed, so the sheet doesn't draw again for what only
  // changes the canvas: a drag, a search, a lit line (Step 87.2).
  const selectedTarget = React.useMemo(
    () =>
      // Nobody is added as a placeholder child's relative (Step 98.2).
      selectedPerson && selectedPerson.placeholder_number == null
        ? {
            id: selectedPerson.id,
            name:
              selectedPerson.preferred_name ||
              selectedPerson.first_name ||
              personDisplayName(selectedPerson),
          }
        : null,
    [selectedPerson],
  );
  // Whose relative the Add button adds (Step 19.2): whoever is selected, as
  // long as the viewer may add from them — a Leaf, only on their own line.
  const addTarget =
    editable && selectedTarget && canAddRelativeOf(selectedTarget.id, viewer)
      ? selectedTarget
      : null;
  // On My Family Tree it goes on one of their trees (Step 92.3): from
  // whoever is selected, the trees showing them where the viewer may add
  // from them; else any of their trees, adding without them.
  const selectedTreeIds = selectedPerson?.tree_ids;
  const familyAdd = React.useMemo<FamilyAdd | null>(() => {
    if (!family) return null;
    const { relatedTo, trees } = addTreesFromView(
      selectedTarget && selectedTreeIds
        ? { id: selectedTarget.id, tree_ids: selectedTreeIds }
        : null,
      family.trees,
      viewerOn,
    );
    return {
      relatedTo: relatedTo ? selectedTarget : null,
      trees,
      currentTreeId: family.currentTreeId,
    };
  }, [family, selectedTarget, selectedTreeIds, viewerOn]);
  const selectedPet = allPets.find((pet) => pet.id === selectedPetId) ?? null;

  // The sheets, mounted once the canvas has painted and their code is here
  // (sooner if a pointer comes over a card first), or at once for one opened
  // before then (a `?person=` link), and kept so they close as they always
  // did.
  const [panelsReady, loadPanels] = useLoadedSoon(preloadPanels);

  // Off a spotlight's line nothing grows or lights on hover; whoever the
  // pointer is over is named in a soft pill at the bottom right instead
  // (Step 97.3). Kept out of the canvas's state, so a pointer crossing
  // the cards draws the pill again and nothing else.
  const hover = useHoverStore();
  const onNodeMouseEnter = React.useCallback<NodeMouseHandler>(
    (_, node) => {
      if (!panelsReady) loadPanels();
      const off = !!(node.data as { blurred?: boolean }).blurred;
      hover.set(off && canHover() ? node.id : null);
    },
    [panelsReady, loadPanels, hover],
  );
  const onNodeMouseLeave = React.useCallback(() => hover.set(null), [hover]);
  const describeOffLine = React.useCallback(
    (id: string): HoverSummary | null => {
      if (!(dataById.get(id) as { blurred?: boolean } | undefined)?.blurred) {
        return null;
      }
      const person = personById.get(id);
      if (person) {
        const place = person.city_of_birth || person.country_of_birth;
        return {
          name: personDisplayName(person),
          detail:
            [personLifespan(person), place].filter(Boolean).join(" · ") ||
            null,
        };
      }
      const pet = allPets.find((p) => p.id === id);
      if (!pet) return null;
      return {
        name: pet.name,
        detail: [speciesLabel(pet), petYears(pet)].filter(Boolean).join(" · "),
      };
    },
    [dataById, personById, allPets],
  );
  const [personOpened, setPersonOpened] = React.useState(false);
  if (selectedPerson && !personOpened) setPersonOpened(true);
  const [petOpened, setPetOpened] = React.useState(false);
  if (selectedPet && !petOpened) setPetOpened(true);

  // Kept while every name stays the same: a card dropped changes its row,
  // not what the sheets offer (Step 87.2).
  const peopleOptions = useKept(
    React.useMemo(
      () =>
        people.map((p) => ({
          id: p.id,
          label: personDisplayName(p),
          // Names and dates an album photo's are matched to (Step 88.6).
          person: tagPersonOf(p),
        })),
      [people],
    ),
    shareEqual,
  );

  // A companion is editable by whoever added it, an admin, or anyone who can
  // already edit one of its people — looser than a person entry on purpose.
  const canEditPet =
    editable &&
    !!selectedPet &&
    canEditCompanion(selectedPet, viewer, canEditPersonId);

  const relations = React.useMemo<PersonRelation[]>(() => {
    if (!selectedId) return NO_RELATIONS;
    const nameById = new Map(people.map((p) => [p.id, personDisplayName(p)]));
    // A line to a basic card is another tree's, unless it was drawn here
    // or by the viewer (Step 80).
    const basicIds = new Set(people.filter((p) => p.basic).map((p) => p.id));
    return relationships
      .filter(
        (r) =>
          (r.type === "parent" || r.type === "spouse") &&
          (r.from_person === selectedId || r.to_person === selectedId),
      )
      .flatMap((r) => {
        const otherId =
          r.from_person === selectedId ? r.to_person : r.from_person;
        const otherName = nameById.get(otherId);
        if (!otherName) return [];
        // parent edges are stored from = parent, to = child.
        const kind: PersonRelation["kind"] =
          r.type === "spouse"
            ? "spouse"
            : r.from_person === selectedId
              ? "child"
              : "parent";
        return [
          {
            id: r.id,
            otherName,
            kind,
            marriageDate: r.marriage_date,
            marriageWithoutYear: asDayMonth(r.marriage_month, r.marriage_day),
            isDivorced: r.is_divorced,
            divorceDate: r.divorce_date,
            // On My Family Tree, only where it was drawn on a tree they're
            // a Root or a Branch of (Step 92.3).
            canEdit: isFamily
              ? lineEditableFromView(r, viewerOn)
              : editable &&
                canEditConnection(r, viewer) &&
                (r.drawn_here ||
                  r.created_by === viewer.userId ||
                  !(basicIds.has(r.from_person) || basicIds.has(r.to_person))),
          },
        ];
      });
  }, [selectedId, relationships, people, viewer, editable, isFamily, viewerOn]);
  // On My Family Tree, a card's sheet acts on the card's own tree (Step
  // 92.3): what's told, added or reported from it goes there.
  const cardTreeId = family ? (selectedPerson?.tree_id ?? null) : null;
  const cardViewer = cardTreeId ? viewerOn(cardTreeId) : null;
  // A person's details follow their home tree's rules, whichever tree is
  // showing them (Step 93): who the viewer is there decides Edit and Fill
  // in (Step 44), as the edit page does.
  const selectedHome = selectedPerson ? homeViewerOf(selectedPerson) : null;
  const rights =
    (editable || isFamily) && selectedPerson
      ? entryRights(entrySubject(selectedPerson), selectedHome, selfPersonId)
      : null;
  const canEdit = !!rights?.canEdit;
  const canFill = !!rights?.canFill;
  // A Root of the card's tree, on My Family Tree; of this tree, on a tree.
  const sheetIsAdmin = family
    ? !!cardViewer && accountTypeOf(cardViewer.role).runsTree
    : isAdmin;
  // A basic card says too little of itself for the entry's rule, so it has
  // its own: a Root's to send, when nobody is behind it (Step 84).
  // A full one, this tree's Root, or the entry's home-tree rules (Step 93).
  const canInvite =
    editable &&
    !!selectedPerson &&
    (selectedPerson.basic
      ? canInviteToClaimCard(selectedPerson, viewer)
      : canInviteToClaimHere(
          entrySubject(selectedPerson),
          viewer,
          selectedHome,
        ));
  const canDelete =
    editable &&
    !!selectedPerson &&
    canOfferDeleteHere(
      entrySubject(selectedPerson),
      selectedPerson.is_home,
      viewer,
      selectedHome,
    );
  const selectedInvites = React.useMemo(
    () =>
      selectedId && !readOnly
        ? claimInvites.filter((i) => i.personId === selectedId)
        : NO_INVITES,
    [claimInvites, selectedId, readOnly],
  );
  const selectedSuggestions = React.useMemo(
    () =>
      selectedId && !readOnly
        ? changeSuggestions.filter((s) => s.personId === selectedId)
        : NO_SUGGESTIONS,
    [changeSuggestions, selectedId, readOnly],
  );
  const selectedDeclined = React.useMemo(
    () =>
      selectedId && !readOnly
        ? declinedSuggestions.filter((s) => s.personId === selectedId)
        : NO_DECLINED,
    [declinedSuggestions, selectedId, readOnly],
  );
  const selectedPets = React.useMemo(
    () =>
      selectedId
        ? allPets.filter((pet) => pet.companions.includes(selectedId))
        : NO_PETS,
    [allPets, selectedId],
  );
  // On My Family Tree, every one of the viewer's trees showing whoever is
  // open, for their sheet to name (Step 92.2).
  const selectedTrees = React.useMemo(() => {
    if (!family || !selectedPerson?.tree_ids) return null;
    const byId = new Map(family.trees.map((t) => [t.id, t]));
    return selectedPerson.tree_ids.flatMap((id) => {
      const tree = byId.get(id);
      return tree ? [tree] : [];
    });
  }, [family, selectedPerson]);
  // Who an album photo added from the sheet may show: on My Family Tree,
  // those the card's tree shows in full, as `add_album_photo` asks.
  const sheetPeople = React.useMemo(() => {
    if (!cardTreeId) return peopleOptions;
    const onTree = new Set(
      people.flatMap((p) =>
        p.full_tree_ids?.includes(cardTreeId) ? [p.id] : [],
      ),
    );
    return peopleOptions.filter((o) => onTree.has(o.id));
  }, [cardTreeId, people, peopleOptions]);
  const selectedPanelSuggestions = React.useMemo(
    () =>
      selectedId
        ? panelSuggestions.filter(
            (s) =>
              s.subjectPersonId === selectedId ||
              s.relatedPersonId === selectedId,
          )
        : NO_PANEL_SUGGESTIONS,
    [panelSuggestions, selectedId],
  );
  // A story credit's card (Step 99): what they are to the story's person,
  // from everything this canvas has, filters or not.
  const describeConnection = React.useCallback(
    (fromId: string, toId: string) =>
      relationOf(fromId, toId, personById, relationships),
    [personById, relationships],
  );
  const onSelectPet = React.useCallback((petId: string) => {
    setSelectedId(null);
    setSelectedPetId(petId);
  }, []);
  const onMinimize = React.useCallback(() => setMinimized(true), []);
  const onClosePerson = React.useCallback(() => setSelectedId(null), []);
  const onClosePet = React.useCallback(() => setSelectedPetId(null), []);
  const onSearchOpenChange = React.useCallback(
    (open: boolean) => setOpenCard(open ? "search" : null),
    [],
  );
  const selectedName = selectedTarget?.name;
  const connectionPrompt = React.useMemo(
    () =>
      selectedPerson && selectedPerson.id === searchedId ? (
        <section className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Route className="size-3.5 text-muted-foreground" />
            How is {selectedName} connected to…
          </h2>
          <PersonPicker
            people={shownPeople}
            value={null}
            onChange={(id) => {
              if (id) connectFromSelected(id);
            }}
            excludeId={selectedPerson.id}
            placeholder="Search a second person…"
            label={`Second person, to show their connection to ${selectedName}`}
          />
          <p className="text-xs text-muted-foreground">
            Pick someone and the line between the two lights up on the tree.
          </p>
        </section>
      ) : null,
    [selectedPerson, searchedId, selectedName, shownPeople, connectFromSelected],
  );
  // Asked in the sheet of a card that may be someone else's too (Step
  // 92.4): naming each, to open in turn, or put away as two people.
  const selectedSame = selectedId ? sameById.get(selectedId) : undefined;
  // Direct relative, their spouse or married in, on My Family Tree (Step
  // 94): said in the sheet as well as by the card's shape. Not the viewer.
  const kinship = React.useMemo(() => {
    if (!family || !selectedId || selectedId === selfPersonId) return null;
    if (spouseIds.has(selectedId)) return { label: "Your spouse" };
    const to = marriedToById?.get(selectedId);
    return to
      ? { label: "Married in", detail: to }
      : { label: "Direct relative" };
  }, [family, selectedId, selfPersonId, spouseIds, marriedToById]);
  const samePersonPrompt = React.useMemo(
    () =>
      selectedId && selectedSame ? (
        <SamePersonPrompt
          others={selectedSame.map((id) => ({
            id,
            name: sameNameOf(id),
            mark: markById.get(id) ?? null,
          }))}
          onOpen={selectPerson}
          onNotSame={(other, two) =>
            setNotSame(pairKey(selectedId, other), two)
          }
        />
      ) : null,
    [selectedId, selectedSame, sameNameOf, markById, selectPerson, setNotSame],
  );

  return (
    <>
      <ReactFlow
        className={cn(pulled && "tree-pulled")}
        // A phone's cards fade without blur or shadow (the `phone:` variant).
        data-phone={phone ? "" : undefined}
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeClick={onEdgeClick}
        onNodeDragStop={editable ? onNodeDragStop : undefined}
        onPaneClick={() => {
          setSelectedId(null);
          setSelectedPetId(null);
          setSelectedEdgeId(null);
          setConnectionEnds(NO_CONNECTION);
        }}
        colorMode={colorMode}
        // The opening view is framed by `frame` below, not by React Flow's own
        // `fitView`: that one runs when the cards are first measured, and a
        // card changing shape re-measures it, so it would re-fire in the
        // middle of a pull-out and yank the camera back off the tree the
        // reader just opened.
        minZoom={0.15}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        // A card that has been pulled out of the tree is not where the reader
        // put it, so dragging is off until the spotlight closes; on a phone
        // it's off altogether (Step 49).
        nodesDraggable={editable && !spotlight && !phone}
        onPointerMove={roomMe ? onCanvasPointerMove : undefined}
        onPointerLeave={roomMe ? () => sendCursor(null) : undefined}
      >
        <ViewportPortal>
          {bands.map((band) => (
            <GenerationLane
              key={band.generation}
              band={band}
              minX={graph.layout.extent.minX - 96}
              maxX={graph.layout.extent.maxX + 96}
              faded={!!spotlight}
            />
          ))}
        </ViewportPortal>
        {roomMe ? (
          <LiveCursors
            cursors={room.cursors}
            peers={room.peers}
            colours={roomColours}
          />
        ) : null}
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false}>
          {selfOnCanvas ? (
            <ControlButton
              onClick={goToMe}
              title="Go to me"
              aria-label="Go to me"
            >
              {/* React Flow fills its control icons; this one is drawn. */}
              <LocateFixed strokeWidth={2.75} style={{ fill: "none" }} />
            </ControlButton>
          ) : null}
        </Controls>
        <WideMiniMap />
        <Panel
          position="top-right"
          className={cn(
            "flex max-w-[45vw] flex-col items-end gap-2 sm:max-w-none",
            // Beside the details sheet rather than under it (Step 19.2) — a
            // person's, unless it's minimized, or a companion's since it
            // stopped being modal. The sheet renders 24rem wide from `sm` up
            // (its base `max-w-sm` wins over the panel's `max-w-md`); below
            // that it covers the canvas and carries its own Add button.
            (sheetOut || selectedPet) && "sm:!mr-[calc(24rem+15px)]",
            // React Flow stacks its panels in the order they're drawn, so the
            // top-left one would cover an open Search & filters card where
            // they meet (on a phone, or beside the sheet).
            openCard === "search" && "!z-10",
          )}
        >
          {readOnly ? (
            <div className="flex max-w-[15rem] flex-col items-end gap-1.5 rounded-lg border border-border bg-card/95 p-3 text-right shadow-md">
              <span className="text-xs text-muted-foreground">
                You&rsquo;re viewing a read-only copy of this family tree.
              </span>
              {/* In a dialog over the canvas, so asking keeps their place
                  (Step 41.4). */}
              <RequestInviteDialog
                treeSlug={treeSlug}
                signedIn={currentUserId !== ""}
                size="sm"
              >
                ask to join
              </RequestInviteDialog>
            </div>
          ) : editable ? (
            <AddRelativeButton
              relatedTo={addTarget}
              labelFrom={sheetOut ? "lg" : "sm"}
            />
          ) : familyAdd ? (
            // Which of their trees it goes on, asked when there's a choice
            // (Step 92.3).
            <FamilyAddButton
              add={familyAdd}
              labelFrom={sheetOut ? "lg" : "sm"}
            />
          ) : null}
          {/* Under Add a relative since Step 60, its words showing from the
              same width as Add's. */}
          <TreeSearch
            open={openCard === "search"}
            onOpenChange={onSearchOpenChange}
            people={shownPeople}
            filter={filter}
            onFilterChange={setFilter}
            onPick={onPick}
            connection={connectionEnds}
            onConnectionChange={onConnectionChange}
            connectionMissing={
              !!connectionEnds.from && !!connectionEnds.to && !path
            }
            showCompanions={showCompanions}
            onShowCompanionsChange={setShowCompanions}
            sideOnly={rootSide ? sideOnly : null}
            onSideOnlyChange={onSideOnlyChange}
            ownSide={!!selfPersonId && rootIds.includes(selfPersonId)}
            descendantsOf={descendantsOf}
            onDescendantsOfChange={onDescendantsOfChange}
            descendantChoices={sidePeople}
            labelFrom={sheetOut ? "lg" : "sm"}
          />
          {/* The key to the cards' marks (Step 92.2), under Search: on the
              left it would sit over the generations' names. */}
          {family ? <TreeKey trees={family.trees} /> : null}
          {!readOnly && isAdmin ? (
            // It undoes every move anyone has made by hand, so it asks first
            // (Step 70); the dialog shows it running.
            <ConfirmButton
              size="sm"
              variant="outline"
              className="group/expand gap-0"
              aria-label="Auto-arrange"
              confirm={{
                title: "Auto-arrange the tree?",
                description:
                  "Every card moved by hand goes back to its place.\nThis cannot be undone.",
                confirmLabel: "auto-arrange",
                pendingLabel: "arranging…",
                onConfirm: () => autoArrangeTree(treeId),
              }}
            >
              <ColumnsIcon />
              <ExpandingLabel>auto-arrange</ExpandingLabel>
            </ConfirmButton>
          ) : null}
        </Panel>
        {path && pathSummary && !(linkedToYou && folded) ? (
          <Panel
            position="bottom-center"
            className="w-[min(34rem,calc(100%-7rem))]"
          >
            <div
              className="mx-auto flex w-fit max-w-full items-center gap-3 rounded-2xl border bg-card px-4 py-2 text-sm shadow-md"
              style={{
                borderColor: `color-mix(in srgb, ${SPOTLIGHT_BROWN} 33%, transparent)`,
              }}
            >
              <span aria-hidden style={{ color: SPOTLIGHT_GREEN }}>
                🌿
              </span>
              {/* Stacked, so a long name for the connection wraps under the
                  two people rather than being cut off beside them. */}
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">
                  {pathSummary.from}
                  <span className="mx-1.5 text-muted-foreground/50">↔</span>
                  {pathSummary.to}
                </span>
                <span className="text-xs text-muted-foreground">
                  {pathSummary.label}
                </span>
              </span>
              <button
                type="button"
                className="relative tap-target text-muted-foreground hover:text-foreground"
                onClick={() =>
                  // Lit by a click on My Family Tree: closing it closes them.
                  linkedToYou
                    ? setSelectedId(null)
                    : setConnectionEnds(NO_CONNECTION)
                }
                aria-label="Show the whole tree again"
              >
                ✕
              </button>
            </div>
          </Panel>
        ) : selectedPerson && (spotlight || (family && folded)) ? (
          <Panel
            position="bottom-center"
            className={cn(
              "flex flex-col items-center gap-1.5",
              // Clear of the zoom controls, as the tip is.
              folded && "w-[min(24rem,calc(100%-7rem))]",
            )}
          >
            {folded ? (
              <FoldedDetails
                person={selectedPerson}
                isSelf={selectedPerson.id === selfPersonId}
                onExpand={() => setMinimized(false)}
                onClose={() => setSelectedId(null)}
                expandRef={foldedRef}
              />
            ) : spotlight ? (
              <div
                className="flex items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm shadow-md"
                style={{
                  borderColor: `color-mix(in srgb, ${SPOTLIGHT_BROWN} 33%, transparent)`,
                }}
              >
                <span aria-hidden style={{ color: SPOTLIGHT_GREEN }}>
                  🌿
                </span>
                <span className="font-medium text-foreground">
                  {personDisplayName(selectedPerson)}&rsquo;s tree
                </span>
                <span className="text-muted-foreground">
                  {spotlight.ancestors}{" "}
                  {plural(spotlight.ancestors, "ancestor")}
                  <span className="mx-1.5 text-muted-foreground/50">·</span>
                  {spotlight.descendants}{" "}
                  {plural(spotlight.descendants, "descendant")}
                </span>
                <button
                  type="button"
                  className="relative tap-target text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedId(null)}
                  aria-label="Show the whole tree again"
                >
                  ✕
                </button>
              </div>
            ) : null}
            <span className="rounded-full bg-card/80 px-2 py-0.5 text-center text-[11px] text-muted-foreground">
              Each leaf is a tree that grows where that person was born.
            </span>
          </Panel>
        ) : null}
        {/* The tip shares the pills' slot, so it steps aside while one shows. */}
        {!spotlight && !connection && !folded ? (
          <CanvasTip family={!!family} />
        ) : null}
        {connection ? (
          <Panel position="bottom-center">
            <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-md">
              <span className="font-medium text-foreground">
                {connection.label}
              </span>
              <span className="text-muted-foreground">
                {connection.from}
                <span className="mx-1.5 text-muted-foreground/50">
                  {connection.separator}
                </span>
                {connection.to}
              </span>
              <button
                type="button"
                className="relative tap-target text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedEdgeId(null)}
                aria-label="Clear connection highlight"
              >
                ✕
              </button>
            </div>
          </Panel>
        ) : null}
        <OffSpotlightPill
          store={hover}
          describe={describeOffLine}
          className={
            // Beside the minimap, or the open sheet that covers it.
            sheetOut || selectedPet
              ? "sm:!mr-[calc(24rem+15px)]"
              : "sm:!mr-[227px]"
          }
        />
        <Panel position="top-left" className="flex flex-col items-start gap-2">
          {/* Who's here, above Upcoming (Step 60). */}
          <PresenceFaces
            peers={room.peers}
            colours={roomColours}
            personById={personById}
            onGoTo={goToPeer}
          />
          {!readOnly ? (
            <UpcomingFeed
              occasions={occasions}
              today={today}
              personById={personById}
              filtered={!!side || !!descent || filterActive}
              open={openCard === "upcoming"}
              onOpenChange={(open) => setOpenCard(open ? "upcoming" : null)}
              onPickPerson={selectPerson}
              onPickCouple={(a, b) => onConnectionChange({ from: a, to: b })}
            />
          ) : null}
          {editable && claimCandidates.length > 0 ? (
            <ClaimSuggestions
              candidates={claimCandidates}
              notes={claimNotes}
            />
          ) : null}
          {editable && gettingStarted ? (
            <GettingStarted treeId={treeId} items={gettingStarted} />
          ) : null}
        </Panel>
      </ReactFlow>

      {panelsReady || personOpened ? (
        <PersonPanel
          // A hidden person's card is a blur to a visitor: nothing to open.
          person={selectedPerson?.blurred ? null : selectedPerson}
          treeId={cardTreeId ?? treeId}
          pets={selectedPets}
          people={sheetPeople}
          onSelectPet={onSelectPet}
          describeConnection={describeConnection}
          suggestions={selectedPanelSuggestions}
          relations={relations}
          isAdmin={sheetIsAdmin}
          isSelf={selectedPerson?.id === selfPersonId}
          canEdit={canEdit}
          canFill={canFill}
          canDelete={canDelete}
          canInviteToClaim={canInvite}
          claimInvites={selectedInvites}
          changeSuggestions={selectedSuggestions}
          declinedSuggestions={selectedDeclined}
          readOnly={readOnly}
          shareToken={shareToken}
          onTrees={selectedTrees}
          currentTreeId={family?.currentTreeId ?? null}
          familyAdd={familyAdd}
          claimable={!!selectedPerson && claimableIds.has(selectedPerson.id)}
          claimNote={
            selectedPerson ? (claimNotes.get(selectedPerson.id) ?? null) : null
          }
          isCreator={selectedPerson?.created_by === currentUserId}
          currentUserId={currentUserId}
          addRelativeOf={addTarget}
          connectionPrompt={connectionPrompt}
          samePerson={samePersonPrompt}
          kinship={kinship}
          minimized={minimized}
          onMinimize={onMinimize}
          minimizedFocus={foldedRef}
          onClose={onClosePerson}
        />
      ) : null}

      {panelsReady || petOpened ? (
        <PetPanel
          pet={selectedPet}
          treeId={treeId}
          people={peopleOptions}
          canEdit={canEditPet}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          readOnly={!editable}
          shareToken={shareToken}
          onClose={onClosePet}
          onSelectPerson={selectPerson}
        />
      ) : null}
    </>
  );
}

/** Rows with each photo, full size and card-sized (Step 87.5), at the
 *  address this tab already has for it. */
function withKeptPhotos<
  T extends { photo_url: string | null; photo_card_url: string | null },
>(rows: T[]): T[] {
  let changed = false;
  const kept = rows.map((row) => {
    const url = keptPhotoUrl(row.photo_url);
    const cardUrl = keptPhotoUrl(row.photo_card_url);
    if (url === row.photo_url && cardUrl === row.photo_card_url) return row;
    changed = true;
    return { ...row, photo_url: url, photo_card_url: cardUrl };
  });
  return changed ? kept : rows;
}

/**
 * What the canvas was handed, with everything equal to what it had last
 * time kept as the very same objects (Step 87.1, audit C2): a save hands
 * over every row afresh, and each photo newly signed, though almost none of
 * them changed. Kept, the layout doesn't run again, the canvas isn't
 * re-seeded, and only the cards whose rows did change draw again.
 */
function keepProps(prev: Props, next: Props): Props {
  return shareEqual(prev, {
    ...next,
    people: withKeptPhotos(next.people),
    pets: withKeptPhotos(next.pets),
  });
}

/**
 * The minimap, from `sm` up only (Step 87.7, audit C6): hidden below it, it
 * still worked out its bounds on every frame of a pan. Its own component, so
 * learning the width after hydration redraws it and not the canvas.
 */
function WideMiniMap() {
  const wide = useIsSm();
  if (!wide) return null;
  return (
    <MiniMap
      pannable
      zoomable
      nodeColor="var(--muted-foreground)"
      maskColor="var(--muted)"
      className="!bg-card"
    />
  );
}

export function FamilyTree(given: Props) {
  const props = useKept(given, keepProps);
  // Which page this is, for the drops the canvas holds (Step 87.3): the
  // same object when Back brings it again.
  const page = pageNumber(given);
  // A page drawn again by the server: whatever the details sheet read
  // about anyone may have changed (Step 87.6).
  React.useEffect(() => markPersonSheetsStale(), [page]);
  if (props.people.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="text-lg font-semibold">The tree is empty</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add yourself first, then connect relatives to build out the tree.
        </p>
        <Button
          nativeButton={false}
          render={<Link href={onboardingHref()} />}
        >
          add yourself
        </Button>
      </div>
    );
  }

  return (
    // The screen below the header, whatever its height (SiteHeaderHeight,
    // Step 61): one row since Step 85.2, but it still wraps where even its
    // compact row can't fit.
    <div className="relative h-[calc(100dvh-var(--site-header-height,3.5rem))] w-full">
      {props.visitorNote ? (
        <p
          role="note"
          className="absolute inset-x-0 top-0 z-30 border-b border-border bg-muted/90 px-4 py-1.5 text-center text-xs text-muted-foreground backdrop-blur"
        >
          {props.visitorNote}
        </p>
      ) : null}
      <ReactFlowProvider>
        <Canvas {...props} page={page} />
      </ReactFlowProvider>
    </div>
  );
}
