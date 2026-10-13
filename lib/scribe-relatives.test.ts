import { describe, expect, it } from "vitest";

import { detectionTree, type DetectionTree } from "@/lib/connection-suggestions";
import type { RelativeProposal } from "@/lib/scribe-facts";
import {
  BLOOD_TIE_RULE,
  asksAdult,
  judgeRelative,
  questionKey,
  readRelativeRefusal,
  relativeAfter,
  relativeDraft,
  relativeEdges,
  relativeInviteAddress,
  relativeQuestions,
  relativeRow,
  relativeStatus,
  relativeSuggestions,
  relativesDone,
  sameAs,
  yesWords,
  type CheckSaid,
  type RelativeDraft,
} from "@/lib/scribe-relatives";

// Amarshi and Fatma are Rehmat's parents; Rehmat and Karim are Aalim's.
const AMARSHI = "00000000-0000-4000-8000-00000000000a";
const FATMA = "00000000-0000-4000-8000-00000000000f";
const REHMAT = "00000000-0000-4000-8000-000000000001";
const KARIM = "00000000-0000-4000-8000-00000000000c";
const AALIM = "00000000-0000-4000-8000-000000000005";

const TODAY = new Date("2026-10-13T12:00:00Z");

const person = (id: string, first: string, last: string, dob: string | null = null) => ({
  id,
  first_name: first,
  preferred_name: null,
  last_name: last,
  placeholder_number: null,
  date_of_birth: dob,
});
const line = (from: string, to: string, type: string) => ({
  from_person: from,
  to_person: to,
  type,
  marriage_date: null,
  divorce_date: null,
  is_divorced: false,
});

const TREE: DetectionTree = detectionTree({
  people: [
    person(AMARSHI, "Amarshi", "Sayani"),
    person(FATMA, "Fatma", "Sayani"),
    person(REHMAT, "Rehmat", "Jaffer", "1932-01-01"),
    person(KARIM, "Karim", "Jaffer"),
    person(AALIM, "Aalim", "Jaffer", "1990-04-12"),
  ],
  edges: [
    line(AMARSHI, FATMA, "spouse"),
    line(AMARSHI, REHMAT, "parent"),
    line(FATMA, REHMAT, "parent"),
    line(KARIM, REHMAT, "spouse"),
    line(REHMAT, AALIM, "parent"),
    line(KARIM, AALIM, "parent"),
  ],
  answered: [],
  nicknames: [],
});

const relative = (p: Partial<RelativeProposal> = {}): RelativeProposal => ({
  key: "r1",
  firstName: "Rahim",
  lastName: null,
  sex: "male",
  relation: "sibling",
  ofId: REHMAT,
  ofName: "Rehmat Jaffer",
  born: null,
  died: false,
  diedWhen: null,
  evidence: "her younger brother Rahim",
  bornYear: null,
  bornPlace: null,
  diedYear: null,
  ...p,
});

const drafted = (r: RelativeProposal, p: Partial<RelativeDraft> = {}): RelativeDraft => ({
  ...relativeDraft(r),
  lastName: "Sayani",
  ...p,
});

describe("relativeEdges", () => {
  it("draws their one line to whom the story named, as it named it", () => {
    const of = { kind: "existing", id: REHMAT };
    const them = { kind: "new", index: 0 };
    expect(relativeEdges(relative({ relation: "parent" }))).toEqual([{ type: "parent", a: them, b: of }]);
    expect(relativeEdges(relative({ relation: "child" }))).toEqual([{ type: "parent", a: of, b: them }]);
    expect(relativeEdges(relative({ relation: "sibling" }))).toEqual([{ type: "sibling", a: of, b: them }]);
    expect(relativeEdges(relative({ relation: "spouse" }))).toEqual([{ type: "spouse", a: of, b: them }]);
  });
});

describe("relativeRow and relativeAfter", () => {
  it("send the names typed, the years the story gave and the place it was found as", () => {
    const r = relative({
      bornYear: { year: 1938, circa: true },
      bornPlace: { id: 186301, city: "Mombasa", country: "Kenya" },
      died: true,
      diedYear: { year: 2001, circa: false },
    });
    expect(relativeRow(r, drafted(r, { firstName: " Rahim " }), true)).toEqual({
      first_name: "Rahim",
      middle_name: "",
      preferred_name: "",
      maiden_name: "",
      last_name: "Sayani",
      country_of_birth: "Kenya",
      city_of_birth: "Mombasa",
      date_of_birth: "1938-01-01",
      date_of_birth_precision: "year",
      birth_month: null,
      birth_day: null,
      is_deceased: true,
      date_of_death: "2001-01-01",
      date_of_death_precision: "year",
      place_of_death: "",
      adult: true,
    });
    expect(relativeAfter(r)).toEqual({ place_id_birth: 186301, sex: "male", date_of_birth_circa: true });
  });

  it("leave out what the story didn't say", () => {
    const r = relative({ sex: null });
    expect(relativeRow(r, drafted(r), null)).toMatchObject({
      country_of_birth: "",
      city_of_birth: "",
      date_of_birth: "",
      date_of_birth_precision: "day",
      is_deceased: false,
      date_of_death: "",
      adult: null,
    });
    expect(relativeAfter(r)).toBeNull();
  });
});

describe("asksAdult", () => {
  it("asks of a living child or sibling, as the web's form does", () => {
    expect(asksAdult(relative(), AALIM, TODAY)).toBe(true);
    expect(asksAdult(relative({ relation: "child" }), AALIM, TODAY)).toBe(true);
  });

  it("doesn't ask of a parent, a partner, someone who died, an adult by year, or the member's own child", () => {
    expect(asksAdult(relative({ relation: "parent" }), AALIM, TODAY)).toBe(false);
    expect(asksAdult(relative({ relation: "spouse" }), AALIM, TODAY)).toBe(false);
    expect(asksAdult(relative({ died: true }), AALIM, TODAY)).toBe(false);
    expect(asksAdult(relative({ bornYear: { year: 1938, circa: true } }), AALIM, TODAY)).toBe(false);
    expect(asksAdult(relative({ relation: "child", ofId: AALIM }), AALIM, TODAY)).toBe(false);
  });
});

describe("relativeQuestions", () => {
  it("asks whether a new sibling shares their parents, every rule behind each answer recorded", () => {
    const r = relative();
    const draft = drafted(r);
    const questions = relativeQuestions(r, draft, TREE);
    expect(questions.map((q) => q.reason)).toEqual([
      "Is Amarshi Sayani also Rahim Sayani’s parent? They’re Rehmat Jaffer’s sibling.",
      "Is Fatma Sayani also Rahim Sayani’s parent? They’re Rehmat Jaffer’s sibling.",
    ]);
    expect(yesWords(questions[0])).toBe("yes, add the parent");
    const answers = { [questionKey(questions[0])]: "accepted" as const };
    expect(relativeSuggestions(questions, answers)).toEqual([
      {
        subject: `existing:${AMARSHI}`,
        related: "new:0",
        suggested_type: "parent",
        source: "sibling_implied_parent",
        resolution: "accepted",
      },
    ]);
  });

  it("asks whether a new child's other parent is their parent's partner", () => {
    const r = relative({ relation: "child", firstName: "Zahra", sex: "female" });
    const questions = relativeQuestions(r, drafted(r, { lastName: "Jaffer" }), TREE);
    expect(questions.map((q) => [q.suggestedType, q.source, q.reason])).toEqual([
      [
        "parent",
        "unlinked_spouse_child",
        "Is Karim Jaffer also Zahra Jaffer’s parent? They’re Rehmat Jaffer’s partner.",
      ],
    ]);
  });

  it("asks what a yes implies too: a brother the tree may have already", () => {
    const SALIM = "00000000-0000-4000-8000-000000000051";
    const tree = detectionTree({
      people: [
        person(AMARSHI, "Amarshi", "Sayani"),
        person(FATMA, "Fatma", "Sayani"),
        person(REHMAT, "Rehmat", "Sayani"),
        person(SALIM, "Salim", "Sayani"),
      ],
      edges: [
        line(AMARSHI, FATMA, "spouse"),
        line(AMARSHI, REHMAT, "parent"),
        line(FATMA, REHMAT, "parent"),
        line(AMARSHI, SALIM, "parent"),
        line(FATMA, SALIM, "parent"),
      ],
      answered: [],
      nicknames: [],
    });
    const r = relative({ firstName: "Salim" });
    const draft = drafted(r);
    const first = relativeQuestions(r, draft, tree);
    expect(first.map((q) => q.suggestedType)).toEqual(["parent", "parent"]);
    const yes = { ...draft, answers: Object.fromEntries(first.map((q) => [questionKey(q), "accepted" as const])) };
    const then = relativeQuestions(r, yes, tree);
    // The parents keep their questions (the yeses draw them); the same
    // person is asked after.
    expect(then.slice(0, 2)).toEqual(first);
    expect(then.slice(2).map((q) => q.reason)).toEqual([
      "Are Salim Sayani and Salim Sayani the same person? They have similar names and the same 2 close relatives.",
    ]);
    // A no draws nothing, so asks nothing more.
    const no = { ...draft, answers: Object.fromEntries(first.map((q) => [questionKey(q), "dismissed" as const])) };
    expect(relativeQuestions(r, no, tree)).toEqual(first);
  });

  it("takes a yes to “same person” to mean they're on the tree already", () => {
    const r = relative({ relation: "child", firstName: "Aalim" });
    const draft = drafted(r, { lastName: "Jaffer" });
    const questions = relativeQuestions(r, draft, TREE);
    const duplicate = questions.find((q) => q.suggestedType === "duplicate_check")!;
    expect(duplicate.reason).toBe(
      "Are Aalim Jaffer and Aalim Jaffer the same person? They have similar names and the same close relative.",
    );
    expect(sameAs(questions, draft, TREE)).toBeNull();
    const yes = { ...draft, answers: { [questionKey(duplicate)]: "accepted" as const } };
    expect(sameAs(questions, yes, TREE)).toBe("Aalim Jaffer");
  });
});

describe("readRelativeRefusal", () => {
  it("reads what the database said", () => {
    expect(
      readRelativeRefusal(
        { message: "ASK_ADULT: is Rehmat Jaffer 18 or older?", details: `existing:${REHMAT}` },
        "Rahim Sayani",
      ),
    ).toEqual({ ask: { id: REHMAT, name: "Rehmat Jaffer" } });
    expect(
      readRelativeRefusal(
        { message: "MINOR: Rahim is under 18; only their parent can add them", details: "new:0" },
        "Rahim Sayani",
      ),
    ).toEqual({ error: "Rahim Sayani is under 18. Only their parent can add them." });
    expect(
      readRelativeRefusal({ message: "BLOODLINE_GATE: Rahim has no blood tie to this tree", details: "new:0" }, "Rahim"),
    ).toEqual({ error: BLOOD_TIE_RULE });
    expect(readRelativeRefusal({ message: "OWN_LINE: a Leaf adds relatives on their own line" }, "Rahim")).toMatchObject({
      error: expect.stringContaining("As a Leaf, you add relatives on your own line"),
    });
    expect(
      readRelativeRefusal({ message: 'new row for relation "people" violates check constraint "people_required_identity"' }, "Rahim"),
    ).toEqual({ error: "Add their first and last name." });
    expect(readRelativeRefusal({ message: "something else" }, "Rahim")).toEqual({ error: "Couldn’t add them." });
  });
});

describe("judgeRelative", () => {
  const ask = (id: string, name: string): CheckSaid => ({
    ok: false,
    message: `ASK_ADULT: is ${name} 18 or older?`,
    details: `existing:${id}`,
  });

  it("puts a question only when a yes would let them in", async () => {
    const calls: string[][] = [];
    const judged = await judgeRelative(
      async (ids) => {
        calls.push(ids);
        return ids.includes(REHMAT) ? { ok: true } : ask(REHMAT, "Rehmat Jaffer");
      },
      [],
      "Rahim Sayani",
    );
    expect(judged).toEqual({ asks: [{ id: REHMAT, name: "Rehmat Jaffer" }], error: null });
    expect(calls).toEqual([[], [REHMAT]]);
  });

  it("says a refusal waiting behind a question at once", async () => {
    const judged = await judgeRelative(
      async (ids) =>
        ids.includes(REHMAT)
          ? { ok: false, message: "BLOODLINE_GATE: Rahim Sayani has no blood tie to this tree", details: "new:0" }
          : ask(REHMAT, "Rehmat Jaffer"),
      [],
      "Rahim Sayani",
    );
    expect(judged).toEqual({ asks: [{ id: REHMAT, name: "Rehmat Jaffer" }], error: BLOOD_TIE_RULE });
  });

  it("takes those asked already as yeses, and stops if asked again", async () => {
    expect(await judgeRelative(async () => ({ ok: true }), [REHMAT], "Rahim")).toEqual({ asks: [], error: null });
    expect(await judgeRelative(async () => ask(REHMAT, "Rehmat Jaffer"), [REHMAT], "Rahim")).toEqual({
      asks: [],
      error: "Couldn’t add them.",
    });
  });
});

describe("relativeStatus", () => {
  const status = (p: Partial<Parameters<typeof relativeStatus>[0]> = {}) => {
    const r = p.r ?? relative();
    return relativeStatus({
      r,
      draft: drafted(r),
      selfId: AALIM,
      questions: [],
      tree: TREE,
      asks: [],
      judged: { error: null },
      today: TODAY,
      ...p,
    });
  };
  const r = relative({ relation: "parent", ofId: AALIM, ofName: "Aalim Jaffer" });

  it("is ready once named, answered and judged", () => {
    expect(status({ r })).toEqual({ at: "ready" });
  });

  it("waits on a name, an answer or the database", () => {
    expect(status({ r, draft: drafted(r, { lastName: " " }) })).toEqual({ at: "waiting", why: "Add Rahim’s last name." });
    expect(status({ r, draft: drafted(r, { firstName: "" }) })).toEqual({ at: "waiting", why: "Add their first name." });
    expect(status()).toEqual({ at: "waiting", why: "Answer the questions about Rahim Sayani." });
    expect(status({ r, judged: null })).toEqual({ at: "waiting", why: "Still checking Rahim Sayani." });
    expect(status({ r, questions: null })).toEqual({ at: "waiting", why: "Still checking Rahim Sayani." });
    const asks = [{ id: REHMAT, name: "Rehmat Jaffer" }];
    expect(status({ r, asks })).toMatchObject({ at: "waiting" });
    expect(status({ r, asks, draft: drafted(r, { existing: { [REHMAT]: true } }) })).toEqual({ at: "ready" });
  });

  it("is refused by a no, a year of birth under 18, or the database", () => {
    const sibling = relative();
    expect(status({ draft: drafted(sibling, { adult: true }) })).toEqual({ at: "ready" });
    expect(status({ draft: drafted(sibling, { adult: false }) })).toEqual({
      at: "refused",
      why: "Rahim Sayani is under 18. Only their parent can add them.",
    });
    const young = relative({ bornYear: { year: 2015, circa: false } });
    expect(status({ r: young, draft: drafted(young, { adult: true }) })).toMatchObject({ at: "refused" });
    const asks = [{ id: REHMAT, name: "Rehmat Jaffer" }];
    expect(status({ r, asks, draft: drafted(r, { existing: { [REHMAT]: false } }) })).toEqual({
      at: "refused",
      why: "Rehmat Jaffer is under 18. Only their parent can add them.",
    });
    expect(status({ r, judged: { error: BLOOD_TIE_RULE } })).toEqual({ at: "refused", why: BLOOD_TIE_RULE });
  });

  it("waits on an address that isn't one, and asks none of someone who has died", () => {
    expect(status({ r, draft: drafted(r, { email: "rahim@" }) })).toEqual({
      at: "waiting",
      why: "Check Rahim’s email address.",
    });
    expect(status({ r, draft: drafted(r, { email: " Rahim@Example.com " }) })).toEqual({ at: "ready" });
    expect(relativeInviteAddress(r, drafted(r, { email: " Rahim@Example.com " }))).toBe("rahim@example.com");
    const gone = relative({ relation: "parent", ofId: AALIM, died: true });
    expect(relativeInviteAddress(gone, drafted(gone, { email: "rahim@" }))).toBe("");
    expect(status({ r: gone, draft: drafted(gone, { email: "rahim@" }) })).toEqual({ at: "ready" });
  });

  it("is on the tree already after a yes to “same person”", () => {
    const twin = relative({ relation: "child", firstName: "Aalim" });
    const draft = drafted(twin, { lastName: "Jaffer" });
    const questions = relativeQuestions(twin, draft, TREE);
    const answers = Object.fromEntries(questions.map((q) => [questionKey(q), "accepted" as const]));
    expect(status({ r: twin, draft: { ...draft, answers }, questions })).toEqual({ at: "same", as: "Aalim Jaffer" });
  });
});

describe("relativesDone", () => {
  it("says who was added and who couldn't be", () => {
    expect(relativesDone([])).toBeNull();
    expect(relativesDone([{ name: "Rahim Sayani", error: null }])).toBe("Rahim Sayani added.");
    expect(
      relativesDone([
        { name: "Rahim Sayani", error: null },
        { name: "Zahra Jaffer", error: null },
        { name: "Amina", error: BLOOD_TIE_RULE },
      ]),
    ).toBe(`2 relatives added. Amina couldn’t be added: ${BLOOD_TIE_RULE}`);
  });

  it("says where invites went, and one that didn't", () => {
    expect(relativesDone([{ name: "Rahim Sayani", error: null, invited: "rahim@example.com" }])).toBe(
      "Rahim Sayani added. Invite sent to rahim@example.com.",
    );
    expect(
      relativesDone([
        { name: "Rahim Sayani", error: null, invited: "rahim@example.com" },
        { name: "Zahra Jaffer", error: null, invited: "zahra@example.com" },
        { name: "Nia Jaffer", error: null, inviteError: "That entry already belongs to a member." },
      ]),
    ).toBe(
      "3 relatives added. 2 invites sent. Nia Jaffer’s invite didn’t send: That entry already belongs to a member.",
    );
  });
});

describe("detectionTree", () => {
  it("names everyone, drops the nameless, and keys what's been answered", () => {
    const tree = detectionTree({
      people: [person(REHMAT, "Rehmat", "Jaffer"), { ...person(KARIM, "", ""), placeholder_number: 1 }],
      edges: [line(KARIM, REHMAT, "spouse"), { ...line(KARIM, REHMAT, "parent"), type: null }],
      answered: [
        { subject_person_id: KARIM, related_person_id: REHMAT, suggested_type: "spouse", source: "co_parent" },
      ],
      nicknames: [
        { variant: "Fateh", canonical: "Fatehali" },
        { variant: "Fateali", canonical: "Fatehali" },
      ],
    });
    expect(tree.people.map((p) => p.label)).toEqual(["Rehmat Jaffer"]);
    expect(tree.edges).toHaveLength(1);
    expect([...tree.resolvedKeys]).toEqual([`spouse|co_parent|${[KARIM, REHMAT].sort().join("|")}`]);
    expect(tree.nicknameGroups).toEqual([["Fatehali", "Fateh", "Fateali"]]);
  });
});
