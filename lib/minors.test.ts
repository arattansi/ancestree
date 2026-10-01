import { describe, expect, it } from "vitest";

import { buildChainEdges, type ConnectionEdge } from "@/lib/connections";
import {
  adultCutoff,
  ageFromBirth,
  minorRefusal,
  newPeopleToAsk,
  readAskAdult,
  readMinorRefusal,
  underAgeMessage,
} from "@/lib/minors";

const TODAY = new Date(Date.UTC(2026, 9, 1)); // 1 October 2026
const living = { is_deceased: false, date_of_birth: "" };

describe("adultCutoff", () => {
  it("is the same day 18 years back", () => {
    expect(adultCutoff(TODAY)).toBe("2008-10-01");
  });
  it("takes 28 February for a leap day", () => {
    expect(adultCutoff(new Date(Date.UTC(2028, 1, 29)))).toBe("2010-02-28");
  });
});

describe("ageFromBirth", () => {
  it("knows an adult and a minor by a full date", () => {
    expect(ageFromBirth("2008-10-01", TODAY)).toBe("adult");
    expect(ageFromBirth("2008-10-02", TODAY)).toBe("minor");
  });
  it("can't tell from a year or month that straddles the day", () => {
    expect(ageFromBirth("2008", TODAY)).toBe("unknown");
    expect(ageFromBirth("2008-10", TODAY)).toBe("unknown");
    expect(ageFromBirth("2008-09", TODAY)).toBe("adult");
    expect(ageFromBirth("2007", TODAY)).toBe("adult");
    expect(ageFromBirth("2009", TODAY)).toBe("minor");
  });
  it("can't tell without a year", () => {
    expect(ageFromBirth("", TODAY)).toBe("unknown");
    expect(ageFromBirth("-03-05", TODAY)).toBe("unknown");
  });
});

describe("newPeopleToAsk", () => {
  const me = { kind: "existing", id: "me" } as const;
  const anchor = "aunt";

  it("asks about someone else's child, not one's own", () => {
    const edges = buildChainEdges(anchor, [{ kind: "new", index: 0 }], ["child"]);
    expect(newPeopleToAsk({ people: [living], edges, self: me, today: TODAY })).toEqual([0]);
    const own = buildChainEdges("me", [{ kind: "new", index: 0 }], ["child"]);
    expect(newPeopleToAsk({ people: [living], edges: own, self: me, today: TODAY })).toEqual([]);
  });

  it("counts a child whose other parent is the member", () => {
    const edges: ConnectionEdge[] = [
      ...buildChainEdges("partner", [{ kind: "new", index: 0 }], ["child"]),
      { type: "parent", a: me, b: { kind: "new", index: 0 } },
    ];
    expect(newPeopleToAsk({ people: [living], edges, self: me, today: TODAY })).toEqual([]);
  });

  it("asks about a sibling, and not about a parent or partner", () => {
    for (const [kind, asked] of [
      ["sibling", [0]],
      ["parent", []],
      ["spouse", []],
    ] as const) {
      const edges = buildChainEdges("me", [{ kind: "new", index: 0 }], [kind]);
      expect(newPeopleToAsk({ people: [living], edges, self: me, today: TODAY })).toEqual(asked);
    }
  });

  it("asks about a grandchild through one's own child", () => {
    // me → in-between 1 (my child) → primary (their child)
    const edges = buildChainEdges(
      "me",
      [{ kind: "new", index: 1 }, { kind: "new", index: 0 }],
      ["child", "child"],
    );
    expect(
      newPeopleToAsk({ people: [living, living], edges, self: me, today: TODAY }),
    ).toEqual([0]);
  });

  it("never asks about the deceased, the member's own new entry, or a dated adult", () => {
    const edges = buildChainEdges(anchor, [{ kind: "new", index: 0 }], ["child"]);
    expect(
      newPeopleToAsk({
        people: [{ is_deceased: true, date_of_birth: "" }],
        edges,
        self: me,
        today: TODAY,
      }),
    ).toEqual([]);
    expect(
      newPeopleToAsk({ people: [living], edges, self: { kind: "new", index: 0 }, today: TODAY }),
    ).toEqual([]);
    expect(
      newPeopleToAsk({
        people: [{ is_deceased: false, date_of_birth: "1990-01-01" }],
        edges,
        self: me,
        today: TODAY,
      }),
    ).toEqual([]);
  });

  it("a member's own new child is theirs during onboarding too", () => {
    // Onboarding: in-between 1 is the member's child, the member (new:0) is
    // their parent.
    const edges = buildChainEdges(
      anchor,
      [{ kind: "new", index: 1 }, { kind: "new", index: 0 }],
      ["child", "parent"],
    );
    expect(
      newPeopleToAsk({
        people: [living, living],
        edges,
        self: { kind: "new", index: 0 },
        today: TODAY,
      }),
    ).toEqual([]);
  });
});

describe("minorRefusal", () => {
  const nameOf = () => "Sam";
  it("refuses a No, and a date under 18 whatever the answer", () => {
    expect(
      minorRefusal({ asked: [0], people: [living], answers: new Map([[0, false]]), nameOf, today: TODAY }),
    ).toBe(underAgeMessage("Sam"));
    expect(
      minorRefusal({
        asked: [0],
        people: [{ date_of_birth: "2015" }],
        answers: new Map([[0, true]]),
        nameOf,
        today: TODAY,
      }),
    ).toBe(underAgeMessage("Sam"));
  });
  it("lets a Yes or an unanswered question through", () => {
    expect(
      minorRefusal({ asked: [0], people: [living], answers: new Map([[0, true]]), nameOf, today: TODAY }),
    ).toBeNull();
    expect(
      minorRefusal({ asked: [0], people: [living], answers: new Map(), nameOf, today: TODAY }),
    ).toBeNull();
  });
});

describe("underAgeMessage", () => {
  it("opens with a capital", () => {
    expect(underAgeMessage("this person")).toBe(
      "This person is under 18. Only their parent can add them.",
    );
    expect(underAgeMessage(null)).toMatch(/^This person/);
  });
});

describe("readAskAdult", () => {
  it("reads who the database asks about", () => {
    expect(
      readAskAdult({
        message: "ASK_ADULT: is Sam Patel 18 or older?",
        details: "existing:abc-123",
      }),
    ).toEqual({ id: "abc-123", name: "Sam Patel" });
    expect(readAskAdult({ message: "ASK_ADULT: is X 18 or older?" })).toBeNull();
    expect(readAskAdult({ message: "MINOR: X is under 18" })).toBeNull();
  });
});

describe("readMinorRefusal", () => {
  it("reads the name from the database's refusal", () => {
    expect(
      readMinorRefusal({ message: "MINOR: Sam Patel is under 18; only their parent can add them" }),
    ).toEqual({ name: "Sam Patel" });
    expect(readMinorRefusal({ message: "something else" })).toBeNull();
  });
});
