/**
 * Where companion animals sit on the canvas.
 *
 * A pet has no generation, so it is deliberately kept out of `tree-layout.ts`:
 * feeding one into the generation engine would mean giving it a rank, a
 * bloodline, and a place in the sibling order, which is exactly the "it's a
 * child" reading this feature must not have. Instead a pet is *hung off* the
 * people it belongs to, after the humans have been placed.
 *
 * A pet's companions can span generations — the dog the grandparents got, that
 * the grandchildren grew up with — so "centre it on everyone" would float the
 * chip into the middle of the chart, attached to nobody. Instead every pet has
 * one **primary connection**, and the two jobs are split:
 *
 *  - the **primary** decides which household the pet belongs to: the chip sits
 *    in the gap directly below the primary's row, and its centre may never
 *    leave the primary's horizontal span, so the chip always visibly overlaps
 *    the card it belongs to;
 *  - **everyone else pulls**: within that span the chip slides to be as central
 *    as it can be relative to *all* of its companions, so a pet shared with a
 *    cousin two rows down leans that way instead of sitting square in the
 *    middle of its primary's card;
 *  - a **married primary shares the pet with their partner**: the anchor is the
 *    couple, not one of them, so a household pet straddles the pair rather than
 *    hanging off one side. The partner does not have to be listed as a
 *    companion for this — the pet lived in their house too.
 *
 * The chip is small — a fraction of a person card — so nothing about it reads
 * as a relative, and pets that land on the same row are swept apart left→right
 * so a household with three cats shows three chips rather than one pile.
 *
 * Pure and deterministic, like the tree layout, so it is unit-testable and the
 * same tree always draws the same way.
 */

import { NODE_H, NODE_W, type XY } from "@/lib/tree-layout";

/** Chip size, matching `pet-node.tsx` (`w-36`, `h-11`). */
export const PET_W = 144;
export const PET_H = 44;
/** Minimum gap between two chips on the same row. */
export const PET_GAP = 16;
/** Drop from the bottom of the companions' cards to the top of the chip. */
export const PET_DROP = 30;

export type LayoutPet = {
  id: string;
  /** The people this pet belongs to. Order does not matter. */
  companions: string[];
  /**
   * The companion the chip hangs from. Null on a pet added before primaries
   * existed, or one whose primary has left the canvas; the topmost, leftmost
   * companion stands in so the placement is still deterministic.
   */
  primary?: string | null;
  /** Manual nudge from the computed spot, as for a person card. */
  pos_dx?: number | null;
  pos_dy?: number | null;
};

export type LayoutPetOptions = {
  /** `personId -> their partners`, so a married primary anchors as a couple. */
  spouses?: Map<string, string[]>;
};

export type PetLayout = {
  /** `petId -> top-left canvas position`, nudges applied. */
  positions: Map<string, XY>;
  /** The same positions with no manual layer — what a drag is measured from. */
  autoPositions: Map<string, XY>;
  /** Pets whose companions are all off the canvas; nothing to hang them from. */
  orphaned: string[];
};

/** The horizontal span a set of cards covers, as `[left, right]`. */
function span(cards: XY[]): [number, number] {
  return [
    Math.min(...cards.map((c) => c.x)),
    Math.max(...cards.map((c) => c.x + NODE_W)),
  ];
}

/**
 * Place every pet under its primary connection.
 *
 * `personPositions` is the *live* human layout (auto positions, not the
 * dragged ones) so a pet follows its people as the tree grows, the same way a
 * person card does.
 */
export function layoutPets(
  pets: LayoutPet[],
  personPositions: Map<string, XY>,
  options: LayoutPetOptions = {},
): PetLayout {
  const { spouses } = options;
  const auto = new Map<string, XY>();
  const orphaned: string[] = [];

  // First pass: the ideal spot — below the primary, pulled towards the rest.
  const placed: { id: string; x: number; y: number }[] = [];
  for (const pet of pets) {
    const onCanvas = pet.companions
      .map((id) => ({ id, at: personPositions.get(id) }))
      .filter((c): c is { id: string; at: XY } => c.at !== undefined)
      // Topmost, then leftmost, then by id: only used to pick a stand-in
      // primary, but it has to be stable however the companions arrive.
      .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x || a.id.localeCompare(b.id));

    if (onCanvas.length === 0) {
      orphaned.push(pet.id);
      continue;
    }

    const primary =
      onCanvas.find((c) => c.id === pet.primary) ?? onCanvas[0];

    // The anchor is the primary plus whoever they are married to. A partner on
    // a different row is a data error rather than a household, so it is left
    // out instead of stretching the anchor across two generations.
    const anchors = [primary.at];
    for (const partnerId of spouses?.get(primary.id) ?? []) {
      const at = personPositions.get(partnerId);
      if (at && at.y === primary.at.y) anchors.push(at);
    }

    const [anchorLeft, anchorRight] = span(anchors);
    // The anchor counts as a connection in its own right: a married primary
    // *shares* the pet, so with nothing else pulling, the chip settles on the
    // middle of the couple rather than over the primary's own card.
    const [allLeft, allRight] = span([
      ...onCanvas.map((c) => c.at),
      ...anchors,
    ]);

    // Sit as centrally as the anchor allows: aim for the middle of everyone,
    // then clamp back inside the anchor's own span. Clamping the *centre* (not
    // the whole chip) means a chip pulled hard to one side still overlaps the
    // card it belongs to by half its width.
    const wanted = (allLeft + allRight) / 2;
    const centre = Math.min(Math.max(wanted, anchorLeft), anchorRight);

    placed.push({
      id: pet.id,
      x: centre - PET_W / 2,
      y: primary.at.y + NODE_H + PET_DROP,
    });
  }

  // Second pass: chips that landed on the same row are pushed apart, keeping
  // their left-to-right order, and the row is re-centred on where it wanted to
  // be so a pair of cats straddles its people instead of drifting right.
  const rows = new Map<number, typeof placed>();
  for (const chip of placed) {
    const row = rows.get(chip.y) ?? [];
    row.push(chip);
    rows.set(chip.y, row);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    const wanted = row.reduce((sum, chip) => sum + chip.x, 0) / row.length;
    let cursor = -Infinity;
    for (const chip of row) {
      chip.x = Math.max(chip.x, cursor);
      cursor = chip.x + PET_W + PET_GAP;
    }
    const got = row.reduce((sum, chip) => sum + chip.x, 0) / row.length;
    for (const chip of row) chip.x -= got - wanted;
  }

  for (const chip of placed) auto.set(chip.id, { x: chip.x, y: chip.y });

  const positions = new Map<string, XY>();
  for (const pet of pets) {
    const base = auto.get(pet.id);
    if (!base) continue;
    positions.set(pet.id, {
      x: base.x + (pet.pos_dx ?? 0),
      y: base.y + (pet.pos_dy ?? 0),
    });
  }

  return { positions, autoPositions: auto, orphaned };
}
