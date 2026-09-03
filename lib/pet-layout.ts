/**
 * Where companion animals sit on the canvas.
 *
 * A pet has no generation, so it is deliberately kept out of `tree-layout.ts`:
 * feeding one into the generation engine would mean giving it a rank, a
 * bloodline, and a place in the sibling order, which is exactly the "it's a
 * child" reading this feature must not have. Instead a pet is *hung off* the
 * people it belongs to, after the humans have been placed:
 *
 *  - it sits in the empty gap **below** its companions, centred on the span of
 *    their cards, so a shared dog visibly belongs to the couple rather than to
 *    either partner;
 *  - the chip is small — a fraction of a person card — so nothing about it
 *    reads as a relative;
 *  - pets that land on the same row are swept apart left→right, so a household
 *    with three cats shows three chips rather than one pile.
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
  /** Manual nudge from the computed spot, as for a person card. */
  pos_dx?: number | null;
  pos_dy?: number | null;
};

export type PetLayout = {
  /** `petId -> top-left canvas position`, nudges applied. */
  positions: Map<string, XY>;
  /** The same positions with no manual layer — what a drag is measured from. */
  autoPositions: Map<string, XY>;
  /** Pets whose companions are all off the canvas; nothing to hang them from. */
  orphaned: string[];
};

/**
 * Place every pet under its companions.
 *
 * `personPositions` is the *live* human layout (auto positions, not the
 * dragged ones) so a pet follows its people as the tree grows, the same way a
 * person card does.
 */
export function layoutPets(
  pets: LayoutPet[],
  personPositions: Map<string, XY>,
): PetLayout {
  const auto = new Map<string, XY>();
  const orphaned: string[] = [];

  // First pass: the ideal spot, centred under the companion span.
  const placed: { id: string; x: number; y: number }[] = [];
  for (const pet of pets) {
    const anchors = pet.companions
      .map((id) => personPositions.get(id))
      .filter((p): p is XY => p !== undefined);
    if (anchors.length === 0) {
      orphaned.push(pet.id);
      continue;
    }
    const minX = Math.min(...anchors.map((a) => a.x));
    const maxX = Math.max(...anchors.map((a) => a.x + NODE_W));
    const bottom = Math.max(...anchors.map((a) => a.y)) + NODE_H;
    placed.push({
      id: pet.id,
      x: (minX + maxX) / 2 - PET_W / 2,
      y: bottom + PET_DROP,
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
