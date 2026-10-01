import { describe, expect, it } from "vitest";

import type { FamilyLine, Showing } from "@/lib/my-family";
import {
  addedCount,
  isMilestone,
  weeklyIssue,
  type IssueInput,
  type IssuePerson,
} from "@/lib/newsletter";

type P = IssuePerson & { id: string };

const person = (
  id: string,
  first: string,
  last: string,
  born: string | null = null,
  extra: Partial<P> = {},
): P => ({
  id,
  first_name: first,
  preferred_name: null,
  last_name: last,
  date_of_birth: born,
  date_of_birth_precision: "day",
  birth_month: null,
  birth_day: null,
  date_of_birth_circa: false,
  date_of_death: null,
  is_deceased: false,
  ...extra,
});

let lineId = 0;
const line = (
  type: "parent" | "spouse" | "sibling",
  from: string,
  to: string,
  extra: Partial<FamilyLine> = {},
): FamilyLine => ({
  id: `l${++lineId}`,
  from_person: from,
  to_person: to,
  type,
  created_by: "u-root",
  marriage_date: null,
  marriage_month: null,
  marriage_day: null,
  is_divorced: false,
  divorce_date: null,
  drawn_here: true,
  drawn_on_tree_id: "t-rs",
  ...extra,
});

const showing = (treeId: string, row: P, basic = false): Showing<P> => ({
  treeId,
  row,
  basic,
  isHome: !basic,
  placedAt: "2026-01-01T00:00:00Z",
});

// Aalim's example (2026-10-01): one Rattansi-Suleman tree. Karim Kanji's
// mother is a Rattansi, Aalim's father's sister; Aalim married Raiya
// Suleman, whose parents and brother are on the tree too. Raiya's brother
// married Zara this week, and Aalim and Raiya's baby was added.
const people = {
  gpa: person("gpa", "Hassan", "Rattansi"),
  gma: person("gma", "Fatma", "Rattansi"),
  dad: person("dad", "Amir", "Rattansi", "1960-10-06"),
  mom: person("mom", "Nadia", "Rattansi"),
  karimMom: person("karimMom", "Shirin", "Kanji"),
  kanjiDad: person("kanjiDad", "Salim", "Kanji"),
  karim: person("karim", "Karim", "Kanji", "1990-10-08"),
  aalim: person("aalim", "Aalim", "Rattansi", "1992-10-30"),
  raiya: person("raiya", "Raiya", "Rattansi", "1993-10-05"),
  baby: person("baby", "Noor", "Rattansi", "2026-09-28"),
  sDad: person("sDad", "Ali", "Suleman", "1956-10-20"),
  sMom: person("sMom", "Laila", "Suleman"),
  raiyaBro: person("raiyaBro", "Omar", "Suleman", "1995-10-04"),
  zara: person("zara", "Zara", "Suleman"),
};
const lines: FamilyLine[] = [
  line("spouse", "gpa", "gma"),
  line("parent", "gpa", "dad"),
  line("parent", "gma", "dad"),
  line("parent", "gpa", "karimMom"),
  line("parent", "gma", "karimMom"),
  line("spouse", "dad", "mom", { marriage_date: "1986-10-10" }),
  line("parent", "dad", "aalim"),
  line("parent", "mom", "aalim"),
  line("spouse", "karimMom", "kanjiDad"),
  line("parent", "karimMom", "karim"),
  line("parent", "kanjiDad", "karim"),
  line("spouse", "aalim", "raiya", { marriage_date: "2020-10-17" }),
  line("parent", "aalim", "baby"),
  line("parent", "raiya", "baby"),
  line("spouse", "sDad", "sMom"),
  line("parent", "sDad", "raiya"),
  line("parent", "sMom", "raiya"),
  line("parent", "sDad", "raiyaBro"),
  line("parent", "sMom", "raiyaBro"),
  line("spouse", "raiyaBro", "zara"),
];

const TREE = { id: "t-rs", name: "Rattansi-Suleman" };
const SINCE = "2026-09-27T15:00:00Z";
const TODAY = "2026-10-04";

const placement = (personId: string, by: string | null, at = "2026-09-30T12:00:00Z") => ({
  tree_id: TREE.id,
  person_id: personId,
  placed_by: by,
  created_at: at,
});

function input(
  userId: string,
  selfId: string,
  over: Partial<IssueInput<P>> = {},
): IssueInput<P> {
  return {
    userId,
    selfId,
    trees: [TREE],
    showings: Object.values(people).map((p) => showing(TREE.id, p)),
    lines,
    placements: [
      placement("gpa", "u-aalim", "2026-08-01T00:00:00Z"),
      placement("baby", "u-aalim"),
      placement("zara", "u-raiya"),
    ],
    stories: [],
    photos: [],
    memberNames: new Map([
      ["u-aalim", "Aalim Rattansi"],
      ["u-raiya", "Raiya Rattansi"],
    ]),
    since: SINCE,
    today: TODAY,
    ...over,
  };
}

const addedIds = (issue: ReturnType<typeof weeklyIssue>) =>
  issue?.trees.flatMap((t) => t.added.flatMap((g) => g.people.map((n) => n.id))) ?? [];
const occasionIds = (issue: ReturnType<typeof weeklyIssue>) =>
  [...(issue?.week ?? []), ...(issue?.later ?? [])].map((o) => o.people.join("+"));

describe("weeklyIssue: only the reader's own family", () => {
  it("tells Karim about the baby on his mother's side, not the Suleman side", () => {
    const issue = weeklyIssue(input("u-karim", "karim"));
    expect(addedIds(issue)).toEqual(["baby"]);
    expect(issue?.trees[0]).toMatchObject({
      id: "t-rs",
      name: "Rattansi-Suleman",
      added: [{ by: "Aalim Rattansi", byYou: false, people: [{ id: "baby", name: "Noor Rattansi" }] }],
    });
    // Raiya's family's birthdays aren't his either.
    expect(occasionIds(issue)).not.toContain("raiyaBro");
    expect(occasionIds(issue)).not.toContain("sDad");
  });

  it("tells Raiya about her brother's wife, who married into her family", () => {
    const issue = weeklyIssue(input("u-raiya", "raiya"));
    expect(addedIds(issue)).toEqual(["baby", "zara"]);
    const groups = issue!.trees[0].added;
    expect(groups.find((g) => g.people.some((n) => n.id === "zara"))).toMatchObject({
      byYou: true,
    });
    expect(occasionIds(issue)).toContain("raiyaBro");
  });

  it("leaves Aalim's wife's family out of his, as My Family Tree does", () => {
    const issue = weeklyIssue(input("u-aalim", "aalim"));
    expect(addedIds(issue)).toEqual(["baby"]);
    expect(issue!.trees[0].added[0]).toMatchObject({ by: null, byYou: true });
    // His wife is his: her birthday and their anniversary count.
    expect(occasionIds(issue)).toContain("raiya");
    expect(occasionIds(issue)).not.toContain("raiyaBro");
  });

  it("only counts what was added since the week began", () => {
    const issue = weeklyIssue(
      input("u-karim", "karim", {
        placements: [placement("baby", "u-aalim", "2026-09-27T14:59:59Z")],
      }),
    );
    expect(addedIds(issue)).toEqual([]);
  });

  it("never tells the reader their own entry was added", () => {
    const issue = weeklyIssue(
      input("u-karim", "karim", { placements: [placement("karim", "u-aalim")] }),
    );
    expect(addedIds(issue)).toEqual([]);
  });

  it("names nobody when the placer isn't known, and the tree each was added to", () => {
    const other = { id: "t-k", name: "Kanji" };
    const issue = weeklyIssue(
      input("u-karim", "karim", {
        trees: [TREE, other],
        showings: [
          ...Object.values(people).map((p) => showing(TREE.id, p)),
          showing(other.id, people.kanjiDad),
          showing(other.id, people.karim),
        ],
        placements: [
          { tree_id: other.id, person_id: "kanjiDad", placed_by: null, created_at: "2026-09-29T00:00:00Z" },
          placement("baby", "u-gone"),
        ],
      }),
    );
    expect(issue?.trees.map((t) => [t.name, t.added])).toEqual([
      ["Rattansi-Suleman", [{ by: null, byYou: false, people: [{ id: "baby", name: "Noor Rattansi" }] }]],
      ["Kanji", [{ by: null, byYou: false, people: [{ id: "kanjiDad", name: "Salim Kanji" }] }]],
    ]);
    expect(addedCount(issue!)).toBe(2);
  });
});

describe("weeklyIssue: stories and photos", () => {
  it("lists each person once, under a tree that shows them in full", () => {
    const issue = weeklyIssue(
      input("u-karim", "karim", {
        placements: [],
        stories: [{ person_id: "gma" }, { person_id: "gma" }, { person_id: "sMom" }],
        photos: [
          { photo_id: "ph1", person_id: "dad" },
          { photo_id: "ph2", person_id: "dad" },
        ],
      }),
    );
    expect(issue?.trees[0].stories).toEqual([{ id: "gma", name: "Fatma Rattansi" }]);
    expect(issue?.trees[0].photos).toEqual([{ id: "dad", name: "Amir Rattansi" }]);
  });

  it("says nothing of a story about someone the reader sees only as a basic card", () => {
    const issue = weeklyIssue(
      input("u-karim", "karim", {
        placements: [],
        showings: Object.values(people).map((p) =>
          showing(TREE.id, p.id === "gma" ? { ...p, date_of_birth: null } : p, p.id === "gma"),
        ),
        stories: [{ person_id: "gma" }],
      }),
    );
    expect(issue?.trees ?? []).toEqual([]);
  });
});

describe("weeklyIssue: what's coming up", () => {
  it("lists the week's birthdays and anniversaries, today included", () => {
    const issue = weeklyIssue(input("u-aalim", "aalim", { placements: [] }));
    // His wife's birthday, his father's, his cousin Karim's, his parents'
    // 40th; never his wife's brother's, today.
    expect(issue?.week.map((o) => [o.kind, o.name, o.daysAway, o.years])).toEqual([
      ["birthday", "Raiya Rattansi", 1, 33],
      ["birthday", "Amir Rattansi", 2, 66],
      ["birthday", "Karim Kanji", 4, 36],
      ["anniversary", "Amir & Nadia Rattansi", 6, 40],
    ]);
    expect(issue?.week.find((o) => o.kind === "anniversary")?.milestone).toBe(true);
  });

  it("names round ones up to four weeks out, and nothing else past the week", () => {
    const issue = weeklyIssue(
      input("u-karim", "karim", {
        placements: [],
        showings: Object.values(people).map((p) =>
          showing(
            TREE.id,
            p.id === "gma"
              ? { ...p, date_of_birth: "1946-10-25" } // turns 80 in 21 days
              : p.id === "gpa"
                ? { ...p, date_of_birth: "1945-10-26" } // turns 81 in 22 days
                : p,
          ),
        ),
      }),
    );
    expect(issue?.later.map((o) => [o.name, o.years, o.milestone])).toEqual([
      ["Fatma Rattansi", 80, true],
    ]);
  });

  it("leaves out the dead and anyone outside the family", () => {
    const issue = weeklyIssue(
      input("u-karim", "karim", {
        placements: [],
        showings: Object.values(people).map((p) =>
          showing(TREE.id, p.id === "dad" ? { ...p, is_deceased: true } : p),
        ),
      }),
    );
    const names = issue?.week.map((o) => o.name) ?? [];
    expect(names).not.toContain("Amir Rattansi");
    expect(names).not.toContain("Omar Suleman");
    expect(names).toContain("Raiya Rattansi");
  });

  it("leaves out the reader's own birthday and anniversary", () => {
    const karims = weeklyIssue(input("u-karim", "karim", { placements: [] }));
    expect(occasionIds(karims)).not.toContain("karim");
    const sameDay = lines.map((l) =>
      l.from_person === "aalim" && l.to_person === "raiya"
        ? { ...l, marriage_date: "2020-10-05" }
        : l,
    );
    const aalims = weeklyIssue(input("u-aalim", "aalim", { placements: [], lines: sameDay }));
    expect(occasionIds(aalims)).not.toContain("aalim+raiya");
    // Her birthday is still his to remember.
    expect(occasionIds(aalims)).toContain("raiya");
  });

  it("is quiet with nothing added and nothing coming up", () => {
    const quiet = Object.values(people).map((p) =>
      showing(TREE.id, { ...p, date_of_birth: null }),
    );
    expect(
      weeklyIssue(
        input("u-karim", "karim", {
          placements: [],
          showings: quiet,
          lines: lines.map((l) => ({ ...l, marriage_date: null })),
        }),
      ),
    ).toBeNull();
  });

  it("is nothing without the reader's own entry on their trees", () => {
    expect(
      weeklyIssue(
        input("u-karim", "karim", {
          showings: Object.values(people)
            .filter((p) => p.id !== "karim")
            .map((p) => showing(TREE.id, p)),
        }),
      ),
    ).toBeNull();
  });
});

describe("isMilestone", () => {
  it.each([
    ["birthday", 1, true],
    ["birthday", 2, false],
    ["birthday", 18, true],
    ["birthday", 21, true],
    ["birthday", 20, false],
    ["birthday", 30, true],
    ["birthday", 45, false],
    ["birthday", 90, true],
    ["birthday", 101, true],
    ["anniversary", 1, true],
    ["anniversary", 5, false],
    ["anniversary", 10, true],
    ["anniversary", 25, true],
    ["anniversary", 35, false],
    ["anniversary", 50, true],
    ["anniversary", 75, true],
  ] as const)("%s %i → %s", (kind, years, expected) => {
    expect(isMilestone({ kind, years })).toBe(expected);
  });

  it("never without a known year", () => {
    expect(isMilestone({ kind: "birthday", years: null })).toBe(false);
  });
});
