import { describe, expect, it } from "vitest";

import {
  asGlimpseInput,
  claimRelation,
  firstName,
  GLIMPSE_ROW_LEAVES,
  glimpseCount,
  glimpseRows,
  type GlimpseInput,
  type GlimpsePerson,
} from "@/lib/invite-glimpse";

const person = (id: string, more: Partial<GlimpsePerson> = {}): GlimpsePerson => ({
  id,
  sex: null,
  city_of_birth: null,
  country_of_birth: null,
  date_of_birth: null,
  hidden: false,
  ...more,
});
const parent = (from: string, to: string) => ({ from_person: from, to_person: to, type: "parent" });
const spouse = (from: string, to: string) => ({ from_person: from, to_person: to, type: "spouse" });

/** Grandparents, Chidi's parents, Chidi and Ada, their two children. */
const family = (): GlimpseInput => ({
  inviterPersonId: "chidi",
  inviterSex: "male",
  inviterLastName: "Okafor",
  inviterMaidenName: null,
  inviterPhotoPath: null,
  inviterPhotoCrop: null,
  claimPersonId: "ada",
  people: [
    person("grandpa", { sex: "male", city_of_birth: "Moshi, Tanganyika" }),
    person("grandma", { sex: "female" }),
    person("dad", { sex: "male", country_of_birth: "Canada" }),
    person("mum", { sex: "female", hidden: true, country_of_birth: "Canada" }),
    person("chidi", { sex: "male" }),
    person("ada", { sex: "female" }),
    person("son", { sex: "male" }),
    person("daughter", { sex: "female" }),
  ],
  lines: [
    spouse("grandpa", "grandma"),
    parent("grandpa", "dad"),
    parent("grandma", "dad"),
    spouse("dad", "mum"),
    parent("dad", "chidi"),
    parent("mum", "chidi"),
    spouse("chidi", "ada"),
    parent("chidi", "son"),
    parent("ada", "son"),
    parent("chidi", "daughter"),
    parent("ada", "daughter"),
  ],
});

describe("asGlimpseInput", () => {
  it("reads invite_glimpse's jsonb", () => {
    const input = asGlimpseInput({
      inviter_person_id: "a",
      inviter_sex: "female",
      inviter_last_name: "Okafor",
      inviter_maiden_name: null,
      inviter_photo_path: "a/photo.jpg",
      inviter_photo_crop: { zoom: 1 },
      claim_person_id: null,
      people: [{ id: "a", sex: "female", city_of_birth: "Lagos", hidden: false }, { sex: "male" }],
      lines: [{ from_person: "a", to_person: "b", type: "parent", is_divorced: null }, { type: "spouse" }],
    });
    expect(input).toMatchObject({
      inviterPersonId: "a",
      inviterPhotoPath: "a/photo.jpg",
      claimPersonId: null,
      people: [{ id: "a", city_of_birth: "Lagos", country_of_birth: null, hidden: false }],
      lines: [{ from_person: "a", to_person: "b", type: "parent", is_divorced: false }],
    });
  });

  it("is nothing for no live invite", () => {
    expect(asGlimpseInput(null)).toBeNull();
    expect(asGlimpseInput([])).toBeNull();
  });
});

describe("glimpseRows", () => {
  it("draws everyone a row a generation, eldest first, the inviter and claim marked", () => {
    const rows = glimpseRows(family());
    expect(rows.map((r) => r.leaves.length)).toEqual([2, 2, 2, 2]);
    expect(rows.every((r) => r.before === 0 && r.after === 0)).toBe(true);
    const marks = rows.flatMap((r) => r.leaves.map((l) => l.mark)).filter(Boolean);
    expect(marks.sort()).toEqual(["inviter", "you"]);
    expect(rows[2].leaves.map((l) => l.mark).sort()).toEqual(["inviter", "you"]);
  });

  it("gives each leaf its birthplace's species, and a plain one to anyone hidden from visitors", () => {
    const shapes = glimpseRows(family()).flatMap((r) => r.leaves.map((l) => l.shape));
    expect(shapes).toContain("baobab");
    // Dad from Canada is a maple; Mum, also from Canada, hides from visitors.
    expect(shapes.filter((s) => s === "ovate").length).toBe(6);
    expect(shapes.filter((s) => s !== "ovate" && s !== "baobab").length).toBe(1);
  });

  it("cuts a long row round the inviter, counting what it leaves out", () => {
    const cousins = Array.from({ length: 40 }, (_, i) => person(`c${String(i).padStart(2, "0")}`));
    const input: GlimpseInput = {
      ...family(),
      claimPersonId: null,
      inviterPersonId: "c05",
      people: [person("p1"), person("p2"), ...cousins],
      lines: [spouse("p1", "p2"), ...cousins.flatMap((c) => [parent("p1", c.id), parent("p2", c.id)])],
    };
    const [, row] = glimpseRows(input);
    expect(row.before + row.leaves.length + row.after).toBe(40);
    expect(row.leaves.length + (row.before ? 1 : 0) + (row.after ? 1 : 0)).toBe(GLIMPSE_ROW_LEAVES);
    expect(row.leaves.some((l) => l.mark === "inviter")).toBe(true);
    expect(row.before).toBe(0);
  });

  it("is empty for an empty tree", () => {
    expect(glimpseRows({ ...family(), people: [], lines: [] })).toEqual([]);
  });
});

describe("claimRelation", () => {
  it("says what the claimed entry is to the inviter, with the inviter's pronoun", () => {
    expect(claimRelation(family())).toBe("his wife");
    expect(claimRelation({ ...family(), claimPersonId: "grandma" })).toBe("his grandmother");
    expect(claimRelation({ ...family(), inviterSex: null })).toBe("their wife");
  });

  it("uses the inviter's own sex for the pronoun, the claimed one's for the word", () => {
    const input = family();
    input.inviterPersonId = "ada";
    input.inviterSex = "female";
    input.claimPersonId = "dad";
    expect(claimRelation(input)).toBe("her father-in-law");
  });

  it("says nothing without both entries or an everyday word", () => {
    expect(claimRelation({ ...family(), claimPersonId: null })).toBeNull();
    expect(claimRelation({ ...family(), inviterPersonId: null })).toBeNull();
    const input = family();
    input.people.push(person("stranger"));
    expect(claimRelation({ ...input, claimPersonId: "stranger" })).toBeNull();
  });
});

describe("glimpseCount", () => {
  it("counts people on the tree and those who have joined, never who", () => {
    expect(glimpseCount({ people: 14, members: 3 })).toBe("14 people are on it, and 3 have joined.");
    expect(glimpseCount({ people: 14, members: 1 })).toBe("14 people are on it so far.");
  });

  it("says a tree of one has just been started", () => {
    expect(glimpseCount({ people: 1, members: 1 })).toBe("It’s just been started.");
    expect(glimpseCount({ people: 0, members: 2 })).toBe("It’s just been started.");
  });
});

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName(" Chidi  Okafor ")).toBe("Chidi");
  });
});
