import { describe, expect, it } from "vitest";

import {
  LAPSE_AFTER_DAYS,
  REMIND_AFTER_DAYS,
  carriedNote,
  carriedSummary,
  carryApprovalOf,
  carryAskNote,
  carryCounts,
  isCarryAsk,
  lineOf,
  showsBasic,
  waitingOn,
  type CarryLine,
} from "@/lib/carry";

const parent = (from: string, to: string): CarryLine => ({
  from_person: from,
  to_person: to,
  type: "parent",
});
const spouse = (a: string, b: string): CarryLine => ({
  from_person: a,
  to_person: b,
  type: "spouse",
});
const sibling = (a: string, b: string): CarryLine => ({
  from_person: a,
  to_person: b,
  type: "sibling",
});

// Grandpa + Grandma → Dad, Aunt. Dad + Mum → Me, Sister. Sister + Husband →
// Niece. Mum's own parents and brother are her family, not Grandpa's.
const LINES: CarryLine[] = [
  spouse("grandpa", "grandma"),
  parent("grandpa", "dad"),
  parent("grandma", "dad"),
  parent("grandpa", "aunt"),
  parent("grandma", "aunt"),
  spouse("dad", "mum"),
  parent("dad", "me"),
  parent("mum", "me"),
  parent("dad", "sister"),
  parent("mum", "sister"),
  spouse("sister", "husband"),
  parent("sister", "niece"),
  parent("husband", "niece"),
  parent("nana", "mum"),
  sibling("mum", "uncle"),
];

describe("lineOf", () => {
  it("is the person picked and everyone descended from them", () => {
    expect(lineOf("mum", LINES, { partners: false })).toEqual([
      "mum",
      "me",
      "sister",
      "niece",
    ]);
  });

  it("goes a generation at a time, each followed by their partner", () => {
    expect(lineOf("grandpa", LINES, { partners: true })).toEqual([
      "grandpa",
      "grandma",
      "dad",
      "mum",
      "aunt",
      "me",
      "sister",
      "husband",
      "niece",
    ]);
  });

  it("leaves a partner's own family out", () => {
    const line = lineOf("grandpa", LINES, { partners: true });
    expect(line).toContain("mum");
    expect(line).not.toContain("nana");
    expect(line).not.toContain("uncle");
  });

  it("never climbs from the person picked", () => {
    const line = lineOf("mum", LINES, { partners: true });
    expect(line).toEqual(["mum", "dad", "me", "sister", "husband", "niece"]);
    expect(line).not.toContain("nana");
    expect(line).not.toContain("grandpa");
  });

  it("takes the other parent of a child when they never married", () => {
    const lines = [parent("a", "child"), parent("b", "child")];
    expect(lineOf("a", lines, { partners: true })).toEqual(["a", "b", "child"]);
    expect(lineOf("a", lines, { partners: false })).toEqual(["a", "child"]);
  });

  it("doesn't follow a sibling line", () => {
    expect(lineOf("nana", LINES, { partners: true })).not.toContain("uncle");
  });

  it("counts nobody twice, and survives a loop", () => {
    const lines = [
      parent("a", "b"),
      parent("a", "b"),
      parent("b", "c"),
      parent("c", "a"),
      spouse("b", "c"),
    ];
    expect(lineOf("a", lines, { partners: true }).sort()).toEqual(["a", "b", "c"]);
  });

  it("is just them when nothing hangs from them", () => {
    expect(lineOf("niece", LINES, { partners: true })).toEqual(["niece"]);
    expect(lineOf("stranger", LINES, { partners: true })).toEqual(["stranger"]);
  });
});

describe("what bringing them over asks", () => {
  it("counts who comes whole and who waits on whom", () => {
    expect(
      carryCounts([
        { asks: "none" },
        { asks: "owner" },
        { asks: "stewards" },
        { asks: "stewards" },
      ]),
    ).toEqual({ full: 1, owner: 1, stewards: 2 });
    expect(carryCounts([])).toEqual({ full: 0, owner: 0, stewards: 0 });
  });

  it("says so under each name", () => {
    expect(carryAskNote("none")).toBe("In full");
    expect(carryAskNote("owner")).toBe("Basic until they approve");
    expect(carryAskNote("stewards")).toBe(
      "Basic until a Root or Branch approves",
    );
  });

  it("knows its own words", () => {
    expect(isCarryAsk("owner")).toBe(true);
    expect(isCarryAsk("pending")).toBe(false);
    expect(isCarryAsk(null)).toBe(false);
  });
});

describe("waitingOn", () => {
  it("names the member who is asked themselves", () => {
    expect(waitingOn("asked", "owner", "Zara Suleman")).toBe(
      "Waiting for Zara Suleman to approve.",
    );
    expect(waitingOn("declined", "owner", "Zara Suleman")).toBe(
      "Zara Suleman declined to show more.",
    );
  });

  it("names nobody for an entry that is nobody's own", () => {
    expect(waitingOn("asked", "stewards", "Zara Suleman")).toBe(
      "Waiting for a Root or Branch of their home tree to approve.",
    );
    expect(waitingOn("declined", "stewards", "Zara Suleman")).toBe(
      "Their home tree declined to show more.",
    );
  });

  it("says nothing of a card shown in full", () => {
    expect(waitingOn("none", null, "Zara")).toBeNull();
    expect(waitingOn("approved", "owner", "Zara")).toBeNull();
  });

  it("says nobody answered, once the ask has lapsed (Step 83)", () => {
    expect(waitingOn("lapsed", "owner", "Zara Suleman")).toBe(
      "Zara Suleman hasn’t answered.",
    );
    expect(waitingOn("lapsed", "stewards", "Zara Suleman")).toBe(
      "Their home tree hasn’t answered.",
    );
  });
});

describe("an ask that waits, and lapses (Step 83)", () => {
  it("reminds before it lapses", () => {
    expect(REMIND_AFTER_DAYS).toBe(7);
    expect(LAPSE_AFTER_DAYS).toBe(30);
    expect(REMIND_AFTER_DAYS).toBeLessThan(LAPSE_AFTER_DAYS);
  });

  it("reads what the database says, and nothing it doesn't", () => {
    expect(carryApprovalOf("asked")).toBe("asked");
    expect(carryApprovalOf("approved")).toBe("approved");
    expect(carryApprovalOf("declined")).toBe("declined");
    expect(carryApprovalOf("lapsed")).toBe("lapsed");
    expect(carryApprovalOf("none")).toBe("none");
    expect(carryApprovalOf("pending")).toBe("none");
    expect(carryApprovalOf(null)).toBe("none");
  });

  it("keeps the basic card while asked, declined or lapsed", () => {
    expect(showsBasic("asked")).toBe(true);
    expect(showsBasic("declined")).toBe(true);
    expect(showsBasic("lapsed")).toBe(true);
    expect(showsBasic("approved")).toBe(false);
    expect(showsBasic("none")).toBe(false);
  });

  it("tells the Root what each card waits on", () => {
    expect(carriedNote("asked", "owner")).toBe("Basic · waiting for them");
    expect(carriedNote("asked", "stewards")).toBe(
      "Basic · waiting for a Root or Branch",
    );
    expect(carriedNote("declined", "owner")).toBe("Basic · declined");
    expect(carriedNote("lapsed", "stewards")).toBe("Basic · no answer");
    expect(carriedNote("approved", "owner")).toBeNull();
    expect(carriedNote("none", null)).toBeNull();
  });
});

describe("carriedSummary", () => {
  it("says how many came whole and how many wait", () => {
    expect(
      carriedSummary([
        { approval: "none" },
        { approval: "approved" },
        { approval: "asked" },
        { approval: "declined" },
        { approval: "asked" },
      ]),
    ).toBe("2 in full · 3 basic until approved");
  });

  it("leaves out the half that is empty", () => {
    expect(carriedSummary([{ approval: "none" }])).toBe("1 in full");
    expect(carriedSummary([{ approval: "asked" }])).toBe(
      "1 basic until approved",
    );
    expect(carriedSummary([])).toBe("");
  });
});

describe("name only (Step 106)", () => {
  it("reads a shell, and keeps it apart from the basic card", () => {
    expect(carryApprovalOf("shell")).toBe("shell");
    expect(showsBasic("shell")).toBe(false);
    expect(carriedNote("shell", "owner")).toBe("Name only");
    expect(waitingOn("shell", "owner", "Amina")).toBe(
      "This tree shows only their name.",
    );
  });

  it("counts someone brought back name only on their own", () => {
    expect(
      carriedSummary([
        { approval: "none" },
        { approval: "asked" },
        { approval: "shell" },
      ]),
    ).toBe("1 in full · 1 basic until approved · 1 name only");
  });
});
