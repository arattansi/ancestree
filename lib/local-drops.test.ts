import { describe, expect, it } from "vitest";

import {
  dropCard,
  dropSaved,
  dropsSnapshot,
  dropUndone,
  NO_DROPS,
  pageNumber,
  placeDrops,
  subscribeDrops,
} from "@/lib/local-drops";

const unmoved = { pos_dx: null, pos_dy: null, pos_x: null, pos_y: null };
const dropped = { pos_dx: 40, pos_dy: -12, pos_x: null, pos_y: null };

// The store lasts for the tab, so each case uses a tree of its own.
let trees = 0;
function setup() {
  const treeId = `t${++trees}`;
  const amina = { id: "a", first_name: "Amina", ...unmoved };
  const salim = { id: "s", first_name: "Salim", ...unmoved };
  const rows = [amina, salim];
  const page = pageNumber({});
  return { treeId, amina, salim, rows, page };
}

describe("cards dropped in this tab (Step 87.3)", () => {
  it("hands the rows back as they are when nothing was dropped", () => {
    const { treeId, rows, page } = setup();
    expect(placeDrops(rows, NO_DROPS, treeId, page)).toBe(rows);
    expect(placeDrops(rows, dropsSnapshot(), treeId, page)).toBe(rows);
  });

  it("lays a dropped card out where it was dropped while the save is on its way", () => {
    const { treeId, amina, salim, rows, page } = setup();
    dropCard(treeId, "a", unmoved, dropped);
    const out = placeDrops(rows, dropsSnapshot(), treeId, page);
    expect(out).not.toBe(rows);
    expect(out[0]).toEqual({ ...amina, ...dropped });
    expect(out[1]).toBe(salim);
  });

  it("keeps it there once saved, on the page it was dropped on, brought back or not", () => {
    const treeId = `t${++trees}`;
    const handed = { people: [{ id: "a", ...unmoved }] };
    const page = pageNumber(handed);
    const token = dropCard(treeId, "a", unmoved, dropped);
    dropSaved(treeId, "a", token);
    expect(placeDrops(handed.people, dropsSnapshot(), treeId, page)[0].pos_dx).toBe(40);
    // Back draws the very page handed over before the drop.
    expect(pageNumber(handed)).toBe(page);
  });

  it("gives way to the first page drawn after the save", () => {
    const { treeId, rows, page } = setup();
    const token = dropCard(treeId, "a", unmoved, dropped);
    // A page drawn while the save was on its way still has the old row.
    const during = pageNumber({});
    expect(placeDrops(rows, dropsSnapshot(), treeId, during)[0].pos_dx).toBe(40);
    dropSaved(treeId, "a", token);
    expect(placeDrops(rows, dropsSnapshot(), treeId, page)[0].pos_dx).toBe(40);
    expect(placeDrops(rows, dropsSnapshot(), treeId, during)[0].pos_dx).toBe(40);
    // Auto-arrange's page, say: the row reads as it did before the drop,
    // and the server's word wins.
    const after = pageNumber({});
    expect(placeDrops(rows, dropsSnapshot(), treeId, after)).toBe(rows);
  });

  it("gives way to a row that moved on, saved or not", () => {
    const { treeId, amina, salim, page } = setup();
    dropCard(treeId, "a", unmoved, dropped);
    const elsewhere = [{ ...amina, pos_dx: 5, pos_dy: 5 }, salim];
    expect(placeDrops(elsewhere, dropsSnapshot(), treeId, page)).toBe(elsewhere);
  });

  it("puts the card back when the drop is undone, but only for the latest drop", () => {
    const { treeId, rows, page } = setup();
    const first = dropCard(treeId, "a", unmoved, dropped);
    const second = dropCard(treeId, "a", unmoved, { ...dropped, pos_dx: 90 });
    dropUndone(treeId, "a", first);
    dropSaved(treeId, "a", first);
    const held = placeDrops(rows, dropsSnapshot(), treeId, pageNumber({}));
    expect(held[0].pos_dx).toBe(90);
    dropUndone(treeId, "a", second);
    expect(placeDrops(rows, dropsSnapshot(), treeId, page)).toBe(rows);
  });

  it("keeps each tree's drops to that tree", () => {
    const { treeId, rows, page } = setup();
    dropCard(treeId, "a", unmoved, dropped);
    expect(placeDrops(rows, dropsSnapshot(), `${treeId}x`, page)).toBe(rows);
  });

  it("drops a legacy pin along with the old nudge", () => {
    const { treeId, amina, page } = setup();
    const pinned = { ...amina, pos_x: 300, pos_y: 80 };
    dropCard(
      treeId,
      "a",
      { pos_dx: null, pos_dy: null, pos_x: 300, pos_y: 80 },
      dropped,
    );
    const [out] = placeDrops([pinned], dropsSnapshot(), treeId, page);
    expect(out).toMatchObject({ pos_dx: 40, pos_x: null, pos_y: null });
  });

  it("tells whoever is listening", () => {
    const { treeId } = setup();
    let heard = 0;
    const stop = subscribeDrops(() => heard++);
    const token = dropCard(treeId, "a", unmoved, dropped);
    dropSaved(treeId, "a", token);
    stop();
    dropUndone(treeId, "a", token);
    expect(heard).toBe(2);
  });
});
