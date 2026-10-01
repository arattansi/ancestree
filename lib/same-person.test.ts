import { describe, expect, it } from "vitest";

import type { WalkEdge } from "@/lib/graph-walk";
import {
  detailsFit,
  foldName,
  likelySamePeople,
  namesAgree,
  pairKey,
  samePeopleById,
  shownSamePairs,
  type SamePair,
  type SamePersonEntry,
} from "@/lib/same-person";

const A = "tree-a";
const B = "tree-b";

function entry(
  id: string,
  first: string,
  last: string,
  more: Partial<SamePersonEntry> = {},
): SamePersonEntry {
  return {
    id,
    first_name: first,
    preferred_name: null,
    last_name: last,
    maiden_name: null,
    sex: null,
    date_of_birth: null,
    date_of_birth_precision: "day",
    date_of_birth_circa: false,
    birth_month: null,
    birth_day: null,
    date_of_death: null,
    date_of_death_precision: "day",
    date_of_death_circa: false,
    country_of_birth: "",
    tree_ids: [A],
    ...more,
  };
}

const parent = (from: string, to: string): WalkEdge => ({
  from_person: from,
  to_person: to,
  type: "parent",
});
const spouse = (a: string, b: string): WalkEdge => ({
  from_person: a,
  to_person: b,
  type: "spouse",
});
const sibling = (a: string, b: string): WalkEdge => ({
  from_person: a,
  to_person: b,
  type: "sibling",
});

const NOBODY = new Set<string>();

/** Only which pairs, for the tests that don't ask what they stand on. */
function likelyPairs(
  ...args: Parameters<typeof likelySamePeople>
): [string, string][] {
  return likelySamePeople(...args).map((p) => p.ids);
}

describe("namesAgree", () => {
  it("needs a given name and a family name in common", () => {
    const fatima = entry("1", "Fatima", "Rattansi");
    expect(namesAgree(fatima, entry("2", "Fatima", "Rattansi"))).toBe(true);
    expect(namesAgree(fatima, entry("2", "Fatima", "Suleman"))).toBe(false);
    expect(namesAgree(fatima, entry("2", "Zahra", "Rattansi"))).toBe(false);
  });

  it("reads a preferred name as a given name", () => {
    expect(
      namesAgree(
        entry("1", "Mohamedali", "Jaffer", { preferred_name: "Mo" }),
        entry("2", "Mo", "Jaffer"),
      ),
    ).toBe(true);
  });

  it("reads a maiden name as a family name", () => {
    // One tree knows her by her married name, her own family's by hers.
    expect(
      namesAgree(
        entry("1", "Fatima", "Rattansi", { maiden_name: "Suleman" }),
        entry("2", "Fatima", "Suleman"),
      ),
    ).toBe(true);
  });

  it("parts two women of one married name and two maiden names", () => {
    expect(
      namesAgree(
        entry("1", "Fatima", "Rattansi", { maiden_name: "Suleman" }),
        entry("2", "Fatima", "Rattansi", { maiden_name: "Jaffer" }),
      ),
    ).toBe(false);
  });

  it("folds case, accents, dots and dashes", () => {
    expect(foldName("  José-María ")).toBe("jose maria");
    expect(foldName("Al-Noor")).toBe(foldName("al noor"));
    expect(
      namesAgree(entry("1", "José", "Núñez"), entry("2", "jose", "NUNEZ")),
    ).toBe(true);
  });

  it("never matches on an empty name", () => {
    expect(
      namesAgree(
        entry("1", "", "Rattansi", { first_name: null }),
        entry("2", "", "Rattansi", { first_name: null }),
      ),
    ).toBe(false);
  });
});

describe("detailsFit", () => {
  const base = (more: Partial<SamePersonEntry>) =>
    entry("x", "Hassan", "Suleman", more);

  it("parts two sexes, not an unknown one", () => {
    expect(detailsFit(base({ sex: "male" }), base({ sex: "female" }))).toBe(
      false,
    );
    expect(detailsFit(base({ sex: "male" }), base({ sex: null }))).toBe(true);
    expect(
      detailsFit(base({ sex: "male" }), base({ sex: "undisclosed" })),
    ).toBe(true);
  });

  it("lets a year slip by one, a c. year by five", () => {
    const born = (date: string, circa = false) =>
      base({
        date_of_birth: date,
        date_of_birth_precision: "year",
        date_of_birth_circa: circa,
      });
    expect(detailsFit(born("1950-01-01"), born("1951-01-01"))).toBe(true);
    expect(detailsFit(born("1950-01-01"), born("1952-01-01"))).toBe(false);
    expect(detailsFit(born("1950-01-01", true), born("1954-01-01"))).toBe(
      true,
    );
    expect(detailsFit(born("1950-01-01", true), born("1956-01-01"))).toBe(
      false,
    );
  });

  it("parts two birthdays, whatever the years", () => {
    const born = (date: string) => base({ date_of_birth: date });
    // A year typed wrong keeps the birthday.
    expect(detailsFit(born("1933-08-11"), born("1934-08-11"))).toBe(true);
    expect(detailsFit(born("1933-08-11"), born("1933-08-12"))).toBe(false);
    expect(detailsFit(born("1933-08-11"), born("1934-02-03"))).toBe(false);
  });

  it("reads a birthday kept without its year", () => {
    const yearless = base({ birth_month: 8, birth_day: 11 });
    expect(detailsFit(yearless, base({ date_of_birth: "1933-08-11" }))).toBe(
      true,
    );
    expect(detailsFit(yearless, base({ date_of_birth: "1933-09-11" }))).toBe(
      false,
    );
  });

  it("compares a month only where both know it", () => {
    const month = base({
      date_of_birth: "1950-03-01",
      date_of_birth_precision: "month",
    });
    const year = base({
      date_of_birth: "1950-01-01",
      date_of_birth_precision: "year",
    });
    expect(detailsFit(month, year)).toBe(true);
    expect(
      detailsFit(
        month,
        base({ date_of_birth: "1950-07-01", date_of_birth_precision: "month" }),
      ),
    ).toBe(false);
  });

  it("parts two deaths years apart, and a death before a birth", () => {
    const died = (date: string) =>
      base({ date_of_death: date, date_of_death_precision: "year" });
    expect(detailsFit(died("2012-01-01"), died("2017-01-01"))).toBe(false);
    expect(detailsFit(died("2012-01-01"), died("2012-01-01"))).toBe(true);
    expect(
      detailsFit(died("1956-01-01"), base({ date_of_birth: "1990-05-04" })),
    ).toBe(false);
  });

  it("takes a living card and a death as one: a tree may not know", () => {
    expect(
      detailsFit(base({}), base({ date_of_death: "2012-01-01" })),
    ).toBe(true);
  });

  it("parts two countries of birth, not a missing one", () => {
    expect(
      detailsFit(
        base({ country_of_birth: "Kenya" }),
        base({ country_of_birth: "India" }),
      ),
    ).toBe(false);
    expect(
      detailsFit(
        base({ country_of_birth: "Kenya" }),
        base({ country_of_birth: "" }),
      ),
    ).toBe(true);
  });
});

describe("likelySamePeople", () => {
  // Aalim's example: two mothers with matching names, one from each tree.
  const me = entry("me", "Aalim", "Rattansi", { tree_ids: [A, B] });
  const momA = entry("momA", "Fatima", "Rattansi", {
    maiden_name: "Suleman",
    sex: "female",
    date_of_birth: "1960-04-02",
    country_of_birth: "Tanzania",
    tree_ids: [A],
  });
  const momB = entry("momB", "Fatima", "Suleman", {
    sex: "female",
    date_of_birth: "1960-01-01",
    date_of_birth_precision: "year",
    tree_ids: [B],
  });
  const dad = entry("dad", "Karim", "Rattansi", { tree_ids: [A, B] });
  const twoMothers = [
    parent("momA", "me"),
    parent("dad", "me"),
    parent("momB", "me"),
    spouse("dad", "momA"),
  ];

  it("flags two mothers of one child with matching names", () => {
    expect(
      likelyPairs([me, momA, momB, dad], twoMothers, new Set(["me"])),
    ).toEqual([["momA", "momB"]]);
  });

  it("flags them even where one tree shows both", () => {
    expect(
      likelyPairs(
        [me, momA, { ...momB, tree_ids: [A, B] }, dad],
        twoMothers,
        NOBODY,
      ),
    ).toEqual([["momA", "momB"]]);
  });

  it("leaves them be once anything tells them apart", () => {
    const people = (b: Partial<SamePersonEntry>) => [
      me,
      momA,
      { ...momB, ...b },
      dad,
    ];
    for (const apart of [
      { sex: "male" },
      { date_of_birth: "1958-01-01" },
      { country_of_birth: "India" },
      { maiden_name: "Jaffer", last_name: "Rattansi" },
    ]) {
      expect(likelyPairs(people(apart), twoMothers, NOBODY)).toEqual([]);
    }
    // A line between them says they're two.
    expect(
      likelyPairs(
        people({}),
        [...twoMothers, sibling("momA", "momB")],
        NOBODY,
      ),
    ).toEqual([]);
    // So do two members' own entries.
    expect(
      likelyPairs(people({}), twoMothers, new Set(["momA", "momB"])),
    ).toEqual([]);
  });

  it("flags the viewer's own entry against a copy of it", () => {
    const copy = entry("meB", "Aalim", "Rattansi", { tree_ids: [B] });
    const lines = [parent("dad", "me"), parent("dad", "meB")];
    expect(
      likelyPairs(
        [{ ...me, tree_ids: [A] }, copy, dad],
        lines,
        new Set(["me"]),
      ),
    ).toEqual([["me", "meB"]]);
    // Tree B shows them side by side: B's to tell apart.
    expect(likelyPairs([me, copy, dad], lines, new Set(["me"]))).toEqual(
      [],
    );
  });

  // A side of the family entered on both trees, hung on shared grandparents.
  const gpa = entry("gpa", "Hassan", "Suleman", {
    sex: "male",
    date_of_birth: "1930-01-01",
    date_of_birth_precision: "year",
    tree_ids: [A, B],
  });
  const uncleA = entry("uncleA", "Karim", "Suleman", { tree_ids: [A] });
  const uncleB = entry("uncleB", "Karim", "Suleman", { tree_ids: [B] });
  const cousinA = entry("cousinA", "Hassan", "Suleman", {
    date_of_birth: "1992-06-01",
    tree_ids: [A],
  });
  const cousinB = entry("cousinB", "Hassan", "Suleman", {
    date_of_birth: "1992-06-01",
    tree_ids: [B],
  });
  const side = [
    parent("gpa", "uncleA"),
    parent("gpa", "uncleB"),
    parent("uncleA", "cousinA"),
    parent("uncleB", "cousinB"),
  ];

  it("flags a child entered on two trees, and down from them", () => {
    expect(
      likelyPairs([gpa, uncleA, uncleB, cousinA, cousinB], side, NOBODY),
    ).toEqual([
      ["cousinA", "cousinB"],
      ["uncleA", "uncleB"],
    ]);
  });

  it("flags up from a pair: their parents are one child's", () => {
    const gpaA = entry("gpaA", "Hassan", "Suleman", { tree_ids: [A] });
    const gpaB = entry("gpaB", "Hassan", "Suleman", { tree_ids: [B] });
    expect(
      likelyPairs(
        [gpaA, gpaB, momA, momB, me],
        [
          parent("gpaA", "momA"),
          parent("gpaB", "momB"),
          parent("momA", "me"),
          parent("momB", "me"),
        ],
        NOBODY,
      ),
    ).toEqual([
      ["gpaA", "gpaB"],
      ["momA", "momB"],
    ]);
  });

  it("never flags a grandfather and the grandson named for him", () => {
    // Born 62 years apart; and with no dates, in no shared spot.
    expect(
      likelyPairs([gpa, uncleA, cousinA], side.slice(0, 3), NOBODY),
    ).toEqual([]);
    const undated = { ...cousinA, date_of_birth: null };
    expect(
      likelyPairs([{ ...gpa, date_of_birth: null }, uncleA, undated], [
        parent("gpa", "uncleA"),
        parent("uncleA", "cousinA"),
      ], NOBODY),
    ).toEqual([]);
  });

  it("never flags cousins named for one grandfather", () => {
    const ali = entry("ali", "Ali", "Suleman", { tree_ids: [B] });
    const cousin2 = entry("cousin2", "Hassan", "Suleman", {
      date_of_birth: "1992-01-01",
      date_of_birth_precision: "year",
      tree_ids: [B],
    });
    expect(
      likelyPairs(
        [gpa, uncleA, ali, cousinA, cousin2],
        [
          parent("gpa", "uncleA"),
          parent("gpa", "ali"),
          parent("uncleA", "cousinA"),
          parent("ali", "cousin2"),
        ],
        NOBODY,
      ),
    ).toEqual([]);
  });

  it("leaves a tree's own namesake siblings to it", () => {
    // A brother named for one who died young, both on tree A.
    const first = entry("first", "Karim", "Suleman", { tree_ids: [A] });
    const second = entry("second", "Karim", "Suleman", { tree_ids: [A] });
    expect(
      likelyPairs(
        [gpa, first, second],
        [parent("gpa", "first"), parent("gpa", "second")],
        NOBODY,
      ),
    ).toEqual([]);
  });

  it("leaves a tree's two wives of one name to it", () => {
    const husband = entry("husband", "Ali", "Rattansi", { tree_ids: [A, B] });
    const wife1 = entry("wife1", "Fatima", "Rattansi", { tree_ids: [A] });
    const wife2 = entry("wife2", "Fatima", "Rattansi", { tree_ids: [A] });
    const lines = [spouse("husband", "wife1"), spouse("husband", "wife2")];
    expect(
      likelyPairs([husband, wife1, wife2], lines, NOBODY),
    ).toEqual([]);
    // From two trees, a partner of one person entered twice is asked about.
    expect(
      likelyPairs(
        [husband, wife1, { ...wife2, tree_ids: [B] }],
        lines,
        NOBODY,
      ),
    ).toEqual([["wife1", "wife2"]]);
  });

  it("flags siblings of one person, by a sibling line", () => {
    const greatAunt = entry("ga", "Zahra", "Suleman", { tree_ids: [A, B] });
    const sisA = entry("sisA", "Roshan", "Suleman", { tree_ids: [A] });
    const sisB = entry("sisB", "Roshan", "Suleman", { tree_ids: [B] });
    expect(
      likelyPairs(
        [greatAunt, sisA, sisB],
        [sibling("ga", "sisA"), sibling("sisB", "ga")],
        NOBODY,
      ),
    ).toEqual([["sisA", "sisB"]]);
  });

  it("flags the same birthday from two trees with nothing else shared", () => {
    const x = entry("x", "Nadia", "Jaffer", {
      date_of_birth: "1971-11-23",
      tree_ids: [A],
    });
    const y = entry("y", "Nadia", "Jaffer", {
      date_of_birth: "1971-11-23",
      tree_ids: [B],
    });
    expect(likelyPairs([x, y], [], NOBODY)).toEqual([["x", "y"]]);
    // A year alone isn't enough, nor a "c." date.
    expect(
      likelyPairs(
        [
          x,
          { ...y, date_of_birth: "1971-01-01", date_of_birth_precision: "year" },
        ],
        [],
        NOBODY,
      ),
    ).toEqual([]);
    expect(
      likelyPairs(
        [
          { ...x, date_of_birth_circa: true },
          { ...y, date_of_birth_circa: true },
        ],
        [],
        NOBODY,
      ),
    ).toEqual([]);
    // Nor on one tree, side by side.
    expect(
      likelyPairs([x, { ...y, tree_ids: [A] }], [], NOBODY),
    ).toEqual([]);
  });

  it("ignores lines to people off the view", () => {
    expect(
      likelyPairs(
        [uncleA, uncleB],
        [parent("gone", "uncleA"), parent("gone", "uncleB")],
        NOBODY,
      ),
    ).toEqual([]);
  });
});

describe("what a pair stands on", () => {
  const gpaA = entry("gpaA", "Hassan", "Suleman", { tree_ids: [A] });
  const gpaB = entry("gpaB", "Hassan", "Suleman", { tree_ids: [B] });
  const momA = entry("momA", "Fatima", "Suleman", { tree_ids: [A] });
  const momB = entry("momB", "Fatima", "Suleman", { tree_ids: [B] });
  const me = entry("me", "Aalim", "Rattansi", { tree_ids: [A, B] });
  const pairs = likelySamePeople(
    [gpaA, gpaB, momA, momB, me],
    [
      parent("gpaA", "momA"),
      parent("gpaB", "momB"),
      parent("momA", "me"),
      parent("momB", "me"),
    ],
    NOBODY,
  );
  const moms = pairKey("momA", "momB");
  const gpas = pairKey("gpaA", "gpaB");

  it("says a pair flagged from another stands on it", () => {
    expect(pairs).toEqual<SamePair[]>([
      { ids: ["gpaA", "gpaB"], via: [moms] },
      { ids: ["momA", "momB"], via: [] },
    ]);
  });

  it("drops a pair once what it stands on is two people", () => {
    expect(shownSamePairs(pairs).map((p) => p.ids)).toEqual([
      ["gpaA", "gpaB"],
      ["momA", "momB"],
    ]);
    expect(shownSamePairs(pairs, new Set([moms]))).toEqual([]);
    // The other way round, the mothers still stand on their own.
    expect(shownSamePairs(pairs, new Set([gpas])).map((p) => p.ids)).toEqual([
      ["momA", "momB"],
    ]);
  });

  it("keeps a pair while anything it stands on is asked", () => {
    const many: SamePair[] = [
      { ids: ["a", "b"], via: [] },
      { ids: ["c", "d"], via: [] },
      { ids: ["e", "f"], via: [pairKey("a", "b"), pairKey("c", "d")] },
      // Two that stand only on each other never show.
      { ids: ["g", "h"], via: [pairKey("i", "j")] },
      { ids: ["i", "j"], via: [pairKey("g", "h")] },
    ];
    const shown = (dismissed: string[]) =>
      shownSamePairs(many, new Set(dismissed)).map((p) => p.ids.join(""));
    expect(shown([])).toEqual(["ab", "cd", "ef"]);
    expect(shown([pairKey("a", "b")])).toEqual(["cd", "ef"]);
    expect(shown([pairKey("a", "b"), pairKey("d", "c")])).toEqual([]);
  });
});

describe("samePeopleById", () => {
  it("names each card's others, both ways, less those dismissed", () => {
    const pairs: SamePair[] = [
      { ids: ["a", "b"], via: [] },
      { ids: ["a", "c"], via: [] },
    ];
    expect(samePeopleById(pairs)).toEqual(
      new Map([
        ["a", ["b", "c"]],
        ["b", ["a"]],
        ["c", ["a"]],
      ]),
    );
    expect(samePeopleById(pairs, new Set([pairKey("c", "a")]))).toEqual(
      new Map([
        ["a", ["b"]],
        ["b", ["a"]],
      ]),
    );
  });
});
