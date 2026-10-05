import { describe, expect, it } from "vitest";

import {
  ELEVATORS_BASE_X,
  ELEVATORS_BOUNDS,
  ELEVATORS_BUBBLES,
  ELEVATORS_COUPLES,
  ELEVATORS_FAMILIES,
  ELEVATORS_PEOPLE,
  ELEVATORS_SIBLINGS,
  ELEVATORS_UPCOMING,
  elevatorsPerson,
} from "@/lib/elevators-tree";
import { nativeLeaf } from "@/lib/native-leaf";
import { COUPLE_GAP, GUTTER, NODE_H, NODE_W } from "@/lib/tree-dimensions";

const centre = (id: string) => elevatorsPerson(id).x + NODE_W / 2;

describe("the Elevators tree", () => {
  it("has me and you as the two Roots at its base", () => {
    const base = Math.max(...ELEVATORS_PEOPLE.map((p) => p.y));
    for (const id of ["me", "you"]) {
      expect(elevatorsPerson(id).y).toBe(base);
      expect(elevatorsPerson(id).account).toBe("admin");
    }
    expect(ELEVATORS_PEOPLE.filter((p) => p.account === "admin")).toHaveLength(2);
    expect(ELEVATORS_COUPLES).toContainEqual(["me", "you"]);
    // A phone keeps the middle of their couple's line in view.
    expect(ELEVATORS_BASE_X).toBe((elevatorsPerson("me").x + NODE_W + elevatorsPerson("you").x) / 2);
  });

  it("names everyone Aalim named as Aalim named them", () => {
    const named = (id: string) => {
      const p = elevatorsPerson(id);
      return [p.label, `${p.first} ${p.last}`, p.maiden];
    };
    expect(named("me")).toEqual(["me", "Antwan Oswalt", null]);
    expect(named("you")).toEqual(["you", "André Franklin", null]);
    expect(named("momma")).toEqual(["your momma", "Rumi Baldwin", "Morrison"]);
    expect(named("poppa")).toEqual(["your poppa", "René Baldwin", null]);
    expect(named("cousin")).toEqual(["your cousin, too", "Tito ibn Sina", null]);
    expect(named("auntie")).toEqual(["your auntie", "Laila Curie", "Skłodowska"]);
    expect(named("unc")).toEqual(["your unc", "Stone Curie", null]);
    expect(named("cousins-boo")).toEqual(["your cousin’s boo", "Kong Lumumba", null]);
    expect(ELEVATORS_COUPLES).toContainEqual(["cousin", "cousins-boo"]);
    expect(named("niece")).toEqual(["your niece", "Penelope Nishida", null]);
    expect(named("nephew")).toEqual(["your nephew", "Mohandas Bohr", null]);
    expect(ELEVATORS_FAMILIES).toContainEqual({
      parents: ["cousin", "cousins-boo"],
      children: ["niece", "nephew"],
    });
  });

  it("gives everyone a native tree's leaf, not the plain one", () => {
    for (const p of ELEVATORS_PEOPLE) {
      const leaf = nativeLeaf({ city_of_birth: p.city, country_of_birth: p.country });
      expect(leaf.species, p.id).not.toBeNull();
    }
    // Savannah and Atlanta, not the Caucasus's Georgia.
    expect(nativeLeaf({ city_of_birth: "Atlanta", country_of_birth: "United States" }).region).toBe(
      "the United States",
    );
  });

  it("keeps the canvas's gaps: partners close, everyone else a gutter apart", () => {
    const partners = new Set(ELEVATORS_COUPLES.map(([a, b]) => `${a}|${b}`));
    const rows = new Set(ELEVATORS_PEOPLE.map((p) => p.y));
    for (const y of rows) {
      const sorted = ELEVATORS_PEOPLE.filter((p) => p.y === y).sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const [a, b] = [sorted[i - 1], sorted[i]];
        const gap = b.x - (a.x + NODE_W);
        if (partners.has(`${a.id}|${b.id}`)) expect(gap, `${a.id}–${b.id}`).toBe(COUPLE_GAP);
        else expect(gap, `${a.id}–${b.id}`).toBeGreaterThanOrEqual(GUTTER);
      }
    }
  });

  it("hangs each family straight under its parents' trunk, but your cousin", () => {
    for (const { parents, children } of ELEVATORS_FAMILIES) {
      const [left, right] = parents.map(elevatorsPerson);
      const trunk = (left.x + NODE_W + right.x) / 2;
      const xs = children.map(centre);
      // Hung under your unc, clear of the page's words: the trunk jogs.
      if (children.includes("cousin")) expect(elevatorsPerson("cousin").x).toBe(right.x);
      else expect((Math.min(...xs) + Math.max(...xs)) / 2, parents.join("+")).toBe(trunk);
      for (const child of children) {
        expect(elevatorsPerson(child).y).toBeGreaterThan(left.y);
      }
    }
  });

  it("brackets sisters on one row, each the outer partner of her couple", () => {
    for (const [a, b] of ELEVATORS_SIBLINGS) {
      expect(elevatorsPerson(a).y).toBe(elevatorsPerson(b).y);
      // The bracket rises from each one's stem lane, on her left: there it
      // can't meet the trunk that leaves the middle of her couple's line.
      for (const sister of [a, b]) {
        expect(ELEVATORS_COUPLES.find((c) => c.includes(sister))?.[0]).toBe(sister);
      }
    }
  });

  it("draws every leaf inside its bounds", () => {
    const { left, top, width, height } = ELEVATORS_BOUNDS;
    for (const p of ELEVATORS_PEOPLE) {
      expect(p.x).toBeGreaterThan(left);
      expect(p.y).toBeGreaterThan(top);
      expect(p.x + NODE_W).toBeLessThan(left + width);
      expect(p.y + NODE_H).toBeLessThan(top + height);
    }
  });

  it("has a few things coming up, soonest first, and two bubbles (Step 130)", () => {
    expect(ELEVATORS_UPCOMING.length).toBeGreaterThanOrEqual(3);
    expect(ELEVATORS_UPCOMING.length).toBeLessThanOrEqual(4);
    const days = ELEVATORS_UPCOMING.map((o) => o.daysAway);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    for (const o of ELEVATORS_UPCOMING) {
      expect(o.people).toHaveLength(o.kind === "anniversary" ? 2 : 1);
      o.people.forEach((id) => expect(elevatorsPerson(id)).toBeDefined());
    }
    expect(ELEVATORS_BUBBLES.map((b) => b.says).sort()).toEqual([
      "shared a story about your great-great-grandmother",
      "uploaded a family photo from your wedding",
    ]);
    // Only someone with an account shares anything.
    for (const { id } of ELEVATORS_BUBBLES) {
      expect(elevatorsPerson(id).account).not.toBeNull();
    }
  });
});
