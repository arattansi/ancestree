import { describe, expect, it } from "vitest";

import { chosenCandidate } from "@/lib/request-candidates";
import type { SelfCandidate } from "@/lib/self-match";

const amina: SelfCandidate = {
  id: "p1",
  name: "Amina Rattansi",
  lifespan: "b. 1990",
  birthplace: "Nairobi, Kenya",
  parents: "Karim & Zainab",
  score: 1,
};
const aminah: SelfCandidate = { ...amina, id: "p2", name: "Aminah Rattansi", score: 0.9 };

describe("chosenCandidate (Step 30.3)", () => {
  it("returns the entry the Root chose while the request still matches it", () => {
    expect(chosenCandidate([amina, aminah], "p2")).toBe(aminah);
  });

  it("refuses an entry the request doesn't match", () => {
    // Claimed, died or left the tree since the queue was drawn — or an id
    // that was never on the list.
    expect(chosenCandidate([amina, aminah], "p3")).toBeNull();
  });

  it("refuses everything once nothing matches", () => {
    expect(chosenCandidate([], "p1")).toBeNull();
  });
});
